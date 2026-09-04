/**
 * The controller: it owns the state, funnels every change through the pure
 * reducer, persists the result and repaints.
 *
 * Two things here are less obvious than they look:
 *
 *   - The day-rollover watcher. A tablet left on the kitchen counter crosses
 *     midnight with a stale `today`, after which the streak flames, the day
 *     strip and the word "Today" all quietly lie.
 *   - Celebrations are computed by diffing derived state either side of a
 *     mutation, because nothing about badges or ranks is stored.
 */

import { addDays, compareDays, dayKey, startOfWeek } from '../core/dates';
import type { DayKey } from '../core/dates';
import { earnedBadgeIds, newlyEarned } from '../core/badges';
import { MAX_PER_DAY, countFor, personById } from '../core/model';
import type { Person, PersonId, SaveData, Settings } from '../core/model';
import { rankFor } from '../core/ranks';
import { reduce } from '../core/reducer';
import type { Action, RewardDraft } from '../core/reducer';
import { careerPoints, familyGoalProgress } from '../core/scoring';
import { affordableIds, newlyAffordable, rewardById } from '../core/rewards';
import { clear as clearStorage, defaultSave, importJson, load, save as persist } from '../core/storage';
import { Sound } from './audio';
import { Effects } from './effects';
import { clear, el, requireElement, show } from './dom';
import { poopWord } from './format';
import { HomeView } from './home';
import { buildRewards } from './rewards';
import { buildSettings } from './settings';
import { SetupView } from './setup';
import type { PersonDraft } from './setup';
import { buildTrophies } from './trophies';

const INITIAL_STRIP_DAYS = 14;
const STRIP_STEP = 14;
const UNDO_VISIBLE_MS = 6000;
const UNDO_DEPTH = 20;
const ROLLOVER_CHECK_MS = 60_000;

type Sheet = 'none' | 'settings' | 'trophies' | 'rewards';

interface UndoEntry {
  readonly day: DayKey;
  readonly personId: PersonId;
  readonly previousCount: number;
  readonly label: string;
}

export class App {
  save: SaveData;
  today: DayKey;
  selectedDay: DayKey;
  weekStart: DayKey;
  stripDays = INITIAL_STRIP_DAYS;

  private inSetup: boolean;
  private sheet: Sheet = 'none';
  private sheetPerson: PersonId | null = null;
  private editingPerson: PersonId | null = null;
  private editingReward: string | null = null;
  private readonly undoStack: UndoEntry[] = [];
  private undoTimer = 0;

  private readonly home: HomeView;
  private readonly setup: SetupView;
  private readonly sheetLayer: HTMLElement;
  private readonly undoBar: HTMLElement;
  private readonly undoText: HTMLElement;
  private readonly live: HTMLElement;

  constructor(
    private readonly container: HTMLElement,
    private readonly effects: Effects,
    private readonly sound: Sound,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.save = load();
    this.today = dayKey(this.now());
    this.selectedDay = this.today;
    this.weekStart = startOfWeek(this.today);
    this.inSetup = this.save.people.length === 0;

    this.live = requireElement('live');

    this.home = new HomeView(this);
    this.setup = new SetupView(this);

    this.sheetLayer = el('div', { class: 'sheet' });
    this.sheetLayer.hidden = true;
    document.body.append(this.sheetLayer);

    this.undoText = el('span');
    this.undoBar = el('div', { class: 'undo' }, [
      this.undoText,
      el('button', { text: 'Undo', on: { click: () => this.undo() } }),
    ]);
    this.undoBar.hidden = true;
    document.body.append(this.undoBar);

    this.applySettingsToDevices();
    this.watchDayRollover();
  }

  start(): void {
    this.render();
  }

  // ---------- rendering ----------

  render(): void {
    const view = this.inSetup ? this.setup.root : this.home.root;
    if (this.container.firstChild !== view) {
      clear(this.container);
      this.container.append(view);
    }

    if (this.inSetup) {
      this.setup.update();
    } else {
      this.home.update();
    }

    this.renderSheet();
  }

  private renderSheet(): void {
    show(this.sheetLayer, this.sheet !== 'none');
    if (this.sheet === 'none') return;

    const inner = el('div', { class: 'sheet-inner' });
    if (this.sheet === 'settings') {
      inner.append(buildSettings(this, this.editingPerson));
    } else if (this.sheet === 'rewards') {
      inner.append(buildRewards(this));
    } else if (this.sheetPerson) {
      inner.append(buildTrophies(this, this.sheetPerson));
    }

    this.sheetLayer.replaceChildren(inner);
    this.sheetLayer.scrollTop = 0;
  }

  announce(message: string): void {
    this.live.textContent = message;
  }

  // ---------- day and week navigation ----------

  selectDay(day: DayKey): void {
    if (compareDays(day, this.today) > 0) return;

    this.selectedDay = day;
    this.weekStart = startOfWeek(day);
    // Reaching back with the date picker should bring the strip with it.
    while (compareDays(day, addDays(this.today, -(this.stripDays - 1))) < 0) {
      this.stripDays += STRIP_STEP;
    }
    this.render();
  }

  showMoreDays(): void {
    this.stripDays += STRIP_STEP;
    this.render();
  }

  goWeek(delta: number): void {
    const wanted = addDays(this.weekStart, delta * 7);
    if (compareDays(wanted, startOfWeek(this.today)) > 0) return;
    this.weekStart = wanted;
    this.render();
  }

  /**
   * Midnight on an app nobody has closed. `today` moves; the selected day only
   * follows if it was pinned to the day that just ended.
   */
  private watchDayRollover(): void {
    const check = (): void => {
      const current = dayKey(this.now());
      if (current === this.today) return;

      const wasOnToday = this.selectedDay === this.today;
      const wasOnThisWeek = this.weekStart === startOfWeek(this.today);

      this.today = current;
      if (wasOnToday) this.selectedDay = current;
      if (wasOnThisWeek || wasOnToday) this.weekStart = startOfWeek(this.selectedDay);
      this.render();
    };

    window.setInterval(check, ROLLOVER_CHECK_MS);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) check();
    });
  }

  // ---------- mutations ----------

  private commit(action: Action): void {
    const next = reduce(this.save, action, this.today);
    if (next === this.save) return;

    this.save = next;
    persist(this.save);
  }

  /** A count change, with its celebration, its undo entry and its readout. */
  private changeCount(person: Person, wanted: number, origin?: HTMLElement): void {
    const day = this.selectedDay;
    const previous = countFor(this.save.log, day, person.id);
    const target = Math.min(Math.max(0, Math.floor(wanted)), MAX_PER_DAY);
    if (target === previous) return;

    const badgesBefore = earnedBadgeIds(this.save, person.id, this.today);
    const affordableBefore = affordableIds(this.save, person.id, this.today);
    const rankBefore = rankFor(careerPoints(this.save.log, person.id));
    const goalBefore = familyGoalProgress(this.save.log, this.weekStart, this.save.settings.weeklyGoal);

    this.commit({ kind: 'setCount', day, personId: person.id, count: target });

    this.pushUndo({
      day,
      personId: person.id,
      previousCount: previous,
      label: `${person.name} ${target > previous ? '+' : ''}${String(target - previous)}`,
    });

    const now = countFor(this.save.log, day, person.id);
    this.announce(`${person.name}: ${String(now)} ${poopWord(now)} on this day`);

    if (target > previous) {
      this.sound.plop();
      if (origin) this.effects.particle(origin);
    } else {
      this.sound.unplop();
    }

    this.render();
    this.celebrate(person, badgesBefore, affordableBefore, rankBefore.title, goalBefore.met);
    this.home.popCount(person.id, this.effects);
  }

  adjust(person: Person, delta: number, origin?: HTMLElement): void {
    this.changeCount(person, countFor(this.save.log, this.selectedDay, person.id) + delta, origin);
  }

  setCount(person: Person, count: number): void {
    this.changeCount(person, count);
  }

  private celebrate(
    person: Person,
    badgesBefore: ReadonlySet<string>,
    affordableBefore: ReadonlySet<string>,
    rankBefore: string,
    goalBefore: boolean,
  ): void {
    const badgesAfter = earnedBadgeIds(this.save, person.id, this.today);
    const fresh = newlyEarned(badgesBefore, badgesAfter);

    for (const badge of fresh) {
      this.effects.toast(badge.emoji, `${person.name}: ${badge.name}`, badge.blurb);
    }

    // Something new they can actually spend on is the most motivating news
    // there is, so it gets a card of its own.
    for (const reward of newlyAffordable(
      this.save,
      affordableBefore,
      affordableIds(this.save, person.id, this.today),
    )) {
      this.effects.toast(reward.emoji, `${person.name} can claim ${reward.name}`, reward.blurb);
    }

    const rankAfter = rankFor(careerPoints(this.save.log, person.id));
    const rankedUp = rankAfter.title !== rankBefore;
    if (rankedUp) {
      this.effects.toast(rankAfter.emoji, `${person.name} is now ${rankAfter.title}`, 'New rank!');
    }

    const goalAfter = familyGoalProgress(this.save.log, this.weekStart, this.save.settings.weeklyGoal);
    const goalJustMet = goalAfter.met && !goalBefore;
    if (goalJustMet) {
      this.effects.toast('🎉', 'BACKYARD CLEARED', 'The whole family hit this week’s goal.');
    }

    if (goalJustMet) {
      this.sound.goal();
      this.effects.confetti();
    } else if (fresh.length > 0 || rankedUp) {
      this.sound.badge();
      this.effects.confetti();
    }
  }

  // ---------- rewards ----------

  claimReward(person: Person, rewardId: string): void {
    const reward = rewardById(this.save, rewardId);
    const before = this.save;
    this.commit({ kind: 'claimReward', rewardId, personId: person.id });
    if (this.save === before) return;

    this.sound.goal();
    this.effects.confetti();
    if (reward) {
      this.effects.toast(reward.emoji, `${person.name} claimed ${reward.name}`, 'Enjoy!');
      this.announce(`${person.name} claimed ${reward.name}`);
    }
    this.render();
  }

  unclaimReward(person: Person, rewardId: string): void {
    const reward = rewardById(this.save, rewardId);
    if (reward && !window.confirm(`Give back ${person.name}'s ${reward.name}?`)) return;

    const before = this.save;
    this.commit({ kind: 'unclaimReward', rewardId, personId: person.id });
    if (this.save === before) return;

    this.sound.undo();
    this.announce(`${person.name} gave back ${reward?.name ?? 'a reward'}`);
    this.render();
  }

  addReward(draft: RewardDraft): void {
    this.commit({ kind: 'addReward', draft });
    this.editingReward = null;
    this.announce(`${draft.name} added to the rewards`);
    this.render();
  }

  saveRewardEdit(rewardId: string, draft: RewardDraft): void {
    this.commit({ kind: 'editReward', rewardId, draft });
    this.editingReward = null;
    this.render();
  }

  editReward(rewardId: string | null): void {
    this.editingReward = rewardId;
    this.render();
  }

  archiveReward(rewardId: string, archived: boolean): void {
    const reward = rewardById(this.save, rewardId);
    if (archived && reward && !window.confirm(`Remove ${reward.name} from the rewards?`)) return;

    this.commit({ kind: 'archiveReward', rewardId, archived });
    if (this.editingReward === rewardId) this.editingReward = null;
    this.render();
  }

  get rewardBeingEdited(): string | null {
    return this.editingReward;
  }

  openRewards(): void {
    this.sheet = 'rewards';
    this.render();
  }

  // ---------- undo ----------

  private pushUndo(entry: UndoEntry): void {
    this.undoStack.push(entry);
    while (this.undoStack.length > UNDO_DEPTH) this.undoStack.shift();

    this.undoText.textContent = entry.label;
    show(this.undoBar, true);

    window.clearTimeout(this.undoTimer);
    this.undoTimer = window.setTimeout(() => show(this.undoBar, false), UNDO_VISIBLE_MS);
  }

  private undo(): void {
    const entry = this.undoStack.pop();
    show(this.undoBar, false);
    if (!entry) return;

    this.commit({
      kind: 'setCount',
      day: entry.day,
      personId: entry.personId,
      count: entry.previousCount,
    });

    this.sound.undo();
    this.announce(`Undone. ${entry.label} reversed.`);
    this.render();
  }

  // ---------- roster ----------

  addPerson(draft: PersonDraft): void {
    this.commit({ kind: 'addPerson', name: draft.name, emoji: draft.emoji, color: draft.color });
    this.announce(`${draft.name} joined the patrol`);
    this.render();
  }

  savePersonEdit(personId: PersonId, draft: PersonDraft): void {
    this.commit({
      kind: 'editPerson',
      personId,
      name: draft.name,
      emoji: draft.emoji,
      color: draft.color,
    });
    this.editingPerson = null;
    this.render();
  }

  editPerson(personId: PersonId | null): void {
    this.editingPerson = personId;
    this.render();
  }

  retirePerson(personId: PersonId, retired: boolean): void {
    this.commit({ kind: 'retirePerson', personId, retired });
    this.render();
  }

  confirmDeletePerson(person: Person): void {
    const ok = window.confirm(
      `Delete ${person.name}?\n\nThis also erases every pickup they have ever logged. ` +
        'To take them off the list but keep their history, use Retire instead.',
    );
    if (!ok) return;
    this.deletePerson(person.id);
  }

  deletePerson(personId: PersonId): void {
    const person = personById(this.save.people, personId);
    this.commit({ kind: 'deletePerson', personId });
    if (this.editingPerson === personId) this.editingPerson = null;
    if (this.sheetPerson === personId) this.closeSheet();
    if (person) this.announce(`${person.name} removed`);
    this.render();
  }

  finishSetup(): void {
    if (this.save.people.length === 0) return;
    this.inSetup = false;
    this.render();
  }

  // ---------- settings ----------

  updateSettings(settings: Settings): void {
    this.commit({ kind: 'setSettings', settings });
    this.applySettingsToDevices();
    this.render();
  }

  private applySettingsToDevices(): void {
    this.sound.setEnabled(this.save.settings.soundOn);
    this.effects.setConfettiEnabled(this.save.settings.confettiOn);
  }

  importBackup(text: string): void {
    const imported = importJson(text);
    if (!imported) {
      window.alert('That does not look like a Poop Patrol backup.');
      return;
    }

    const ok = window.confirm(
      `Restore ${String(imported.people.length)} patrollers and ${String(Object.keys(imported.log).length)} days?\n\n` +
        'This replaces everything currently on this device.',
    );
    if (!ok) return;

    this.commit({ kind: 'replaceAll', save: imported });
    this.inSetup = this.save.people.length === 0;
    this.applySettingsToDevices();
    this.announce('Backup restored');
    this.render();
  }

  confirmEraseAll(): void {
    if (!window.confirm('Erase every patroller and every pickup on this device?')) return;
    if (!window.confirm('Really erase everything? There is no undo.')) return;

    clearStorage();
    this.save = defaultSave();
    this.inSetup = true;
    this.editingPerson = null;
    this.closeSheet();
    this.announce('Everything erased');
    this.render();
  }

  // ---------- sheets ----------

  openSettings(): void {
    this.sheet = 'settings';
    this.editingPerson = null;
    this.render();
  }

  openTrophies(personId: PersonId): void {
    this.sheet = 'trophies';
    this.sheetPerson = personId;
    this.render();
  }

  closeSheet(): void {
    this.sheet = 'none';
    this.sheetPerson = null;
    this.editingPerson = null;
    this.render();
  }
}
