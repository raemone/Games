/**
 * Roxy's missions, as a pure state machine over shot names.
 *
 * Nothing here knows about the canvas, the clock or the ball. It is fed the
 * name of a shot that was just made - 'squirrel', 'orbit-left', 'bumper' - and
 * returns the next state plus what the table should say and pay. That is what
 * makes the rules testable: a whole mission can be played out in a test in a
 * dozen lines, without a browser.
 *
 * A mission is chosen at the doghouse and runs against a timer. Missing the
 * timer is not a punishment - the progress is kept, so a young player who never
 * finishes one still sees the bar creep up the next time they start it.
 */

export type MissionId = 'fetch' | 'squirrel' | 'walkies' | 'dinner' | 'bath' | 'bone';

/** The names `session.ts` translates the table's hits into. */
export type Shot =
  | 'orbit-left'
  | 'orbit-right'
  | 'lane-r'
  | 'lane-o'
  | 'lane-x'
  | 'lane-y'
  | 'bumper'
  | 'drop'
  | 'drop-bank'
  | 'squirrel'
  | 'spinner'
  | 'doghouse';

export interface MissionDefinition {
  readonly id: MissionId;
  readonly name: string;
  /** The name as it fits on a playfield insert: one word, eight characters. */
  readonly short: string;
  /** One line of flavour, shown when the mission starts. */
  readonly blurb: string;
  /** What to shoot, shown for as long as the mission runs. */
  readonly hint: string;
  readonly goal: number;
  readonly seconds: number;
  /** Points for each step of progress. Completing pays COMPLETION_BONUS on top. */
  readonly value: number;
  /**
   * How much progress this shot is worth, given what the last counting shot
   * was. Zero means the shot does not count towards this mission.
   */
  readonly credit: (shot: Shot, last: Shot | null) => number;
}

const only =
  (...wanted: Shot[]) =>
  (shot: Shot): number =>
    wanted.includes(shot) ? 1 : 0;

export const MISSIONS: readonly MissionDefinition[] = [
  {
    id: 'fetch',
    name: 'Fetch!',
    short: 'FETCH',
    blurb: 'The stick went miles. Roxy is already gone.',
    hint: 'Shoot either orbit - three times',
    goal: 3,
    seconds: 30,
    value: 60_000,
    credit: only('orbit-left', 'orbit-right'),
  },
  {
    id: 'squirrel',
    name: 'Squirrel Chase',
    short: 'SQUIRREL',
    blurb: 'There is a squirrel on the fence. This is now the only thing happening.',
    hint: 'Hit the squirrel - five times',
    goal: 5,
    seconds: 25,
    value: 45_000,
    credit: only('squirrel'),
  },
  {
    id: 'walkies',
    name: 'Walkies',
    short: 'WALKIES',
    blurb: 'Lead. Door. Around the block, and no pulling.',
    hint: 'Alternate the orbits - left, right, left, right',
    goal: 4,
    seconds: 40,
    value: 70_000,
    // A lap means going the other way each time, which is the point of a walk:
    // hitting the same orbit twice is standing still and sniffing a hedge.
    credit: (shot, last) =>
      (shot === 'orbit-left' || shot === 'orbit-right') && shot !== last ? 1 : 0,
  },
  {
    id: 'dinner',
    name: 'Dinner Time',
    short: 'DINNER',
    blurb: 'The bowl is down. Roxy has not blinked since it was picked up.',
    hint: 'Fill the bowl in the bumpers',
    goal: 24,
    seconds: 25,
    value: 9_000,
    credit: only('bumper'),
  },
  {
    id: 'bath',
    name: 'Bath Time',
    short: 'BATH',
    blurb: 'Nobody has told Roxy yet. Knock the brushes down before anyone does.',
    hint: 'Drop all four brushes',
    goal: 4,
    seconds: 35,
    value: 55_000,
    credit: only('drop'),
  },
  {
    id: 'bone',
    name: 'Bury the Bone',
    short: 'BONE',
    blurb: 'A good bone goes in the ground. This is not negotiable.',
    hint: 'Shoot the doghouse - three times',
    goal: 3,
    seconds: 40,
    value: 65_000,
    credit: only('doghouse'),
  },
];

export const MISSION_IDS: readonly MissionId[] = MISSIONS.map((mission) => mission.id);

/** Finishing one is worth far more than the shots that got you there. */
export const COMPLETION_BONUS = 300_000;

/** The reward for finishing all six, on top of lighting the wizard mode. */
export const ALL_MISSIONS_BONUS = 1_000_000;

export function missionById(id: MissionId): MissionDefinition {
  const found = MISSIONS.find((mission) => mission.id === id);
  if (!found) throw new Error(`unknown mission: ${id}`);
  return found;
}

export interface ActiveMission {
  readonly id: MissionId;
  readonly progress: number;
  readonly goal: number;
  /** Ticks of the 60Hz simulation, so the timer stops when the game pauses. */
  readonly ticksLeft: number;
  readonly last: Shot | null;
}

export interface MissionState {
  /** The mission the doghouse will start next. */
  readonly selected: MissionId;
  readonly completed: readonly MissionId[];
  readonly active: ActiveMission | null;
  /** Progress kept from a mission that ran out of time, so it resumes. */
  readonly carried: Readonly<Partial<Record<MissionId, number>>>;
  /** True once all six are done: Best in Show is lit at the doghouse. */
  readonly wizardLit: boolean;
}

export function initialMissions(): MissionState {
  return {
    selected: 'fetch',
    completed: [],
    active: null,
    carried: {},
    wizardLit: false,
  };
}

/** Move the selector to the next mission that has not been finished yet. */
export function cycleSelection(state: MissionState): MissionState {
  const start = MISSION_IDS.indexOf(state.selected);
  for (let step = 1; step <= MISSION_IDS.length; step++) {
    const candidate = MISSION_IDS[(start + step) % MISSION_IDS.length];
    if (candidate && !state.completed.includes(candidate)) {
      return { ...state, selected: candidate };
    }
  }
  return state;
}

export function startSelected(state: MissionState): MissionState {
  if (state.active) return state;
  const definition = missionById(state.selected);
  return {
    ...state,
    active: {
      id: definition.id,
      progress: state.carried[definition.id] ?? 0,
      goal: definition.goal,
      ticksLeft: definition.seconds * 60,
      last: null,
    },
  };
}

export interface MissionResult {
  readonly state: MissionState;
  readonly points: number;
  /** Set when this shot moved the mission on, for the sound and the flash. */
  readonly advanced: boolean;
  /** Set on the shot that finished it. */
  readonly completed: MissionId | null;
  /** Set when finishing it was the sixth, lighting Best in Show. */
  readonly allComplete: boolean;
}

const NOTHING = (state: MissionState): MissionResult => ({
  state,
  points: 0,
  advanced: false,
  completed: null,
  allComplete: false,
});

/** Feed a shot to the running mission, if there is one. */
export function applyShot(state: MissionState, shot: Shot): MissionResult {
  const active = state.active;
  if (!active) return NOTHING(state);

  const definition = missionById(active.id);
  const credit = definition.credit(shot, active.last);
  if (credit <= 0) return NOTHING(state);

  const progress = Math.min(active.goal, active.progress + credit);
  // The shots get more valuable as the mission goes on, so the last one of a
  // long mission is worth having rather than a formality.
  const points = definition.value * credit * (1 + progress / active.goal);

  if (progress < active.goal) {
    return {
      state: { ...state, active: { ...active, progress, last: shot } },
      points,
      advanced: true,
      completed: null,
      allComplete: false,
    };
  }

  const completed = [...state.completed, active.id];
  const allComplete = completed.length === MISSION_IDS.length;
  const carried = { ...state.carried };
  delete carried[active.id];

  const finished: MissionState = {
    ...state,
    active: null,
    completed,
    carried,
    wizardLit: state.wizardLit || allComplete,
  };

  return {
    state: cycleSelection(finished),
    points: points + COMPLETION_BONUS + (allComplete ? ALL_MISSIONS_BONUS : 0),
    advanced: true,
    completed: active.id,
    allComplete,
  };
}

/** One tick of the mission clock. Returns the id of a mission that just timed out. */
export function tickMissions(state: MissionState): {
  readonly state: MissionState;
  readonly timedOut: MissionId | null;
} {
  const active = state.active;
  if (!active) return { state, timedOut: null };
  if (active.ticksLeft > 1) {
    return { state: { ...state, active: { ...active, ticksLeft: active.ticksLeft - 1 } }, timedOut: null };
  }
  return {
    state: {
      ...state,
      active: null,
      // Keeping the progress is the whole difference between a timer that
      // teaches and a timer that punishes.
      carried: { ...state.carried, [active.id]: active.progress },
    },
    timedOut: active.id,
  };
}

/** A drained ball ends the running mission but keeps what it earned. */
export function endMission(state: MissionState): MissionState {
  const active = state.active;
  if (!active) return state;
  return {
    ...state,
    active: null,
    carried: { ...state.carried, [active.id]: active.progress },
  };
}
