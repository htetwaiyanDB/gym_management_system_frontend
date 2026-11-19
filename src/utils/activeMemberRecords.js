function addIdentityKey(keys, prefix, value, normalize = (item) => String(item).trim().toLowerCase()) {
  if (value === null || value === undefined || value === "") return;
  const normalized = normalize(value);
  if (normalized) keys.add(`${prefix}:${normalized}`);
}

// API responses are not identical across membership, trainer and boxing pages.
// Keep all reliable member identifiers so an old record can still be matched to
// a newer active record when one endpoint nests the member and another does not.
export function getMemberIdentityKeys(record) {
  const keys = new Set();
  const member = record?.member;
  const user = record?.user;

  [
    record?.member_id,
    record?.user_id,
    record?.customer_id,
    member?.id,
    member?.member_id,
    member?.user_id,
    user?.id,
    user?.member_id,
    user?.user_id,
  ].forEach((value) => addIdentityKey(keys, "id", value));

  [record?.member_phone, record?.user_phone, member?.phone, user?.phone].forEach((value) =>
    addIdentityKey(keys, "phone", value, (item) => String(item).replace(/\D/g, "")),
  );

  [record?.member_email, record?.user_email, member?.email, user?.email].forEach((value) =>
    addIdentityKey(keys, "email", value),
  );

  return keys;
}

export function getActiveMemberIdentityKeys(records, getStatus) {
  const activeKeys = new Set();

  for (const record of records) {
    if (getStatus(record) !== "active") continue;
    for (const key of getMemberIdentityKeys(record)) activeKeys.add(key);
  }

  return activeKeys;
}

export function belongsToActiveMember(record, activeMemberKeys) {
  for (const key of getMemberIdentityKeys(record)) {
    if (activeMemberKeys.has(key)) return true;
  }
  return false;
}
