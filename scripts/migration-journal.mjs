function assert(condition, message) {
  if (!condition) throw new Error(message);
}

export function validateMigrationJournal(journal) {
  assert(Array.isArray(journal.entries), "Migration journal entries are missing.");
  assert(journal.entries.length > 0, "Migration journal must not be empty.");

  const seenTags = new Set();
  let previousTimestamp = Number.NEGATIVE_INFINITY;

  for (const [position, entry] of journal.entries.entries()) {
    const expectedPrefix = `${String(position).padStart(4, "0")}_`;
    assert(
      entry.idx === position,
      `Expected contiguous migration index ${position}, found ${entry.idx}.`,
    );
    assert(
      entry.tag.startsWith(expectedPrefix),
      `Expected migration ${position} tag to start with ${expectedPrefix}, found ${entry.tag}.`,
    );
    assert(!seenTags.has(entry.tag), `Duplicate migration tag ${entry.tag}.`);
    assert(
      typeof entry.when === "number" && Number.isFinite(entry.when),
      `Expected migration ${entry.tag} to have a finite numeric timestamp, found ${entry.when}.`,
    );
    assert(
      entry.when > previousTimestamp,
      `Expected migration timestamps to be strictly increasing; ${entry.tag} has ${entry.when} after ${previousTimestamp}.`,
    );

    seenTags.add(entry.tag);
    previousTimestamp = entry.when;
  }

  return journal.entries;
}
