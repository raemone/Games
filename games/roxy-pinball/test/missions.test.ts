import { describe, expect, it } from 'vitest';
import {
  ALL_MISSIONS_BONUS,
  COMPLETION_BONUS,
  MISSIONS,
  MISSION_IDS,
  applyShot,
  cycleSelection,
  endMission,
  initialMissions,
  missionById,
  startSelected,
  tickMissions,
} from '../src/game/missions';
import type { MissionId, MissionState, Shot } from '../src/game/missions';

function start(id: MissionId, state = initialMissions()): MissionState {
  return startSelected({ ...state, selected: id });
}

function play(state: MissionState, shots: readonly Shot[]): { state: MissionState; points: number } {
  let points = 0;
  let next = state;
  for (const shot of shots) {
    const result = applyShot(next, shot);
    next = result.state;
    points += result.points;
  }
  return { state: next, points };
}

function repeat(shot: Shot, count: number): Shot[] {
  return Array.from({ length: count }, () => shot);
}

describe('every mission', () => {
  it('can be finished by the shot its hint asks for', () => {
    const shots: Record<MissionId, Shot[]> = {
      fetch: repeat('orbit-left', 3),
      squirrel: repeat('squirrel', 5),
      walkies: ['orbit-left', 'orbit-right', 'orbit-left', 'orbit-right'],
      dinner: repeat('bumper', 24),
      bath: repeat('drop', 4),
      bone: repeat('doghouse', 3),
    };

    for (const mission of MISSIONS) {
      const result = play(start(mission.id), shots[mission.id]);
      expect(result.state.completed).toContain(mission.id);
      expect(result.state.active).toBeNull();
      expect(result.points).toBeGreaterThan(COMPLETION_BONUS);
    }
  });

  it('ignores shots that are not what it asked for', () => {
    for (const mission of MISSIONS) {
      const before = start(mission.id);
      const after = applyShot(before, 'spinner');
      // The spinner is in no mission's list, so nothing should move.
      expect(after.advanced).toBe(false);
      expect(after.points).toBe(0);
      expect(after.state.active?.progress).toBe(before.active?.progress);
    }
  });
});

describe('walkies', () => {
  it('wants the other orbit each time, not the same one four times', () => {
    const same = play(start('walkies'), repeat('orbit-left', 4));
    expect(same.state.active?.progress).toBe(1);
    expect(same.state.completed).toEqual([]);
  });
});

describe('the mission clock', () => {
  it('keeps the progress of a mission that ran out of time', () => {
    let state = play(start('squirrel'), repeat('squirrel', 2)).state;
    const seconds = missionById('squirrel').seconds;
    for (let tick = 0; tick < seconds * 60; tick++) state = tickMissions(state).state;

    expect(state.active).toBeNull();
    expect(state.carried.squirrel).toBe(2);

    // Starting it again picks up where it stopped rather than at zero.
    expect(startSelected({ ...state, selected: 'squirrel' }).active?.progress).toBe(2);
  });

  it('reports the mission that timed out, once', () => {
    let state = start('fetch');
    const seconds = missionById('fetch').seconds;
    const reports: (MissionId | null)[] = [];
    for (let tick = 0; tick < seconds * 60 + 10; tick++) {
      const ticked = tickMissions(state);
      state = ticked.state;
      if (ticked.timedOut) reports.push(ticked.timedOut);
    }
    expect(reports).toEqual(['fetch']);
  });

  it('keeps progress when the ball drains too', () => {
    const state = play(start('dinner'), repeat('bumper', 9)).state;
    expect(endMission(state).carried.dinner).toBe(9);
  });
});

describe('selection', () => {
  it('skips missions that are already finished', () => {
    const state: MissionState = {
      ...initialMissions(),
      selected: 'fetch',
      completed: ['squirrel', 'walkies'],
    };
    expect(cycleSelection(state).selected).toBe('dinner');
  });

  it('moves on by itself once a mission is finished', () => {
    const finished = play(start('fetch'), repeat('orbit-left', 3)).state;
    expect(finished.selected).not.toBe('fetch');
  });
});

describe('finishing the set', () => {
  it('lights Best in Show and pays for it, once', () => {
    let state = initialMissions();
    const shots: Record<MissionId, Shot[]> = {
      fetch: repeat('orbit-left', 3),
      squirrel: repeat('squirrel', 5),
      walkies: ['orbit-left', 'orbit-right', 'orbit-left', 'orbit-right'],
      dinner: repeat('bumper', 24),
      bath: repeat('drop', 4),
      bone: repeat('doghouse', 3),
    };
    let sawAllComplete = 0;

    for (const id of MISSION_IDS) {
      state = startSelected({ ...state, selected: id });
      for (const shot of shots[id]) {
        const result = applyShot(state, shot);
        state = result.state;
        if (result.allComplete) sawAllComplete++;
      }
    }

    expect(state.completed).toHaveLength(MISSION_IDS.length);
    expect(state.wizardLit).toBe(true);
    expect(sawAllComplete).toBe(1);
  });

  it('pays the all-missions bonus on the last shot only', () => {
    let state: MissionState = {
      ...initialMissions(),
      completed: MISSION_IDS.filter((id) => id !== 'bone'),
    };
    state = startSelected({ ...state, selected: 'bone' });
    const first = applyShot(state, 'doghouse');
    expect(first.points).toBeLessThan(ALL_MISSIONS_BONUS);
    const second = applyShot(first.state, 'doghouse');
    const third = applyShot(second.state, 'doghouse');
    expect(third.points).toBeGreaterThan(ALL_MISSIONS_BONUS);
  });
});
