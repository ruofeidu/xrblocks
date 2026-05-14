import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {generateRoomCode, getRoomCodeFromUrl} from './roomCode';

describe('roomCode helpers', () => {
  const originalSearch = window.location.search;

  function setSearch(search: string) {
    history.replaceState(null, '', `${location.pathname}${search}`);
  }

  beforeEach(() => setSearch(''));
  afterEach(() => setSearch(originalSearch));

  describe('getRoomCodeFromUrl', () => {
    it('returns null when ?room is missing', () => {
      expect(getRoomCodeFromUrl()).toBeNull();
    });

    it('returns the code uppercased when length matches', () => {
      setSearch('?room=abcd');
      expect(getRoomCodeFromUrl()).toBe('ABCD');
    });

    it('strips non-letters before length-checking', () => {
      setSearch('?room=AB-CD');
      expect(getRoomCodeFromUrl()).toBe('ABCD');
    });

    it('returns null for codes that are the wrong length', () => {
      setSearch('?room=ABC');
      expect(getRoomCodeFromUrl()).toBeNull();
      setSearch('?room=ABCDE');
      expect(getRoomCodeFromUrl()).toBeNull();
    });

    it('returns null when the cleaned code is empty', () => {
      setSearch('?room=1234');
      expect(getRoomCodeFromUrl()).toBeNull();
    });
  });

  describe('generateRoomCode', () => {
    it('produces a 4-character code from the consonant alphabet', () => {
      const allowed = /^[BCDFGHJKLMNPQRSTVWXYZ]{4}$/;
      for (let i = 0; i < 50; i++) {
        const code = generateRoomCode();
        expect(code).toMatch(allowed);
      }
    });
  });
});
