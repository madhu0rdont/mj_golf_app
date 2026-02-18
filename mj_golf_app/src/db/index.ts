import Dexie, { type EntityTable } from 'dexie';
import type { Club } from '../models/club';
import type { Session, Shot } from '../models/session';

export class MJGolfDB extends Dexie {
  clubs!: EntityTable<Club, 'id'>;
  sessions!: EntityTable<Session, 'id'>;
  shots!: EntityTable<Shot, 'id'>;

  constructor() {
    super('mj-golf');
    this.version(1).stores({
      clubs: 'id, category, sortOrder',
      sessions: 'id, clubId, date, [clubId+date]',
      shots: 'id, sessionId, clubId, [sessionId+clubId]',
    });
    // v2: adds pushPull, sideSpinRate, descentAngle to shots (no index changes)
    this.version(2).stores({
      clubs: 'id, category, sortOrder',
      sessions: 'id, clubId, date, [clubId+date]',
      shots: 'id, sessionId, clubId, [sessionId+clubId]',
    });
  }
}

export const db = new MJGolfDB();
