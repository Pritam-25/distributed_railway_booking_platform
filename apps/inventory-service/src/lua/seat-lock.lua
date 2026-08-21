-- KEYS: seat lock keys (inv:lock:seat:{scheduleId}:{seatInventoryId}:{fromSequence}:{toSequence})
-- ARGV[1]: lockToken (random UUID, e.g. eventId)
-- ARGV[2]: ttl in seconds (e.g. 30s for the inventory-side critical section)
-- Returns: 1 if all locks acquired, 0 otherwise (with rollback of acquired keys)

local lockValue = ARGV[1]
local ttl = tonumber(ARGV[2])
local acquired = {}

for i, key in ipairs(KEYS) do
    local result = redis.call('SET', key, lockValue, 'NX', 'EX', ttl)
    if not result then
        -- Rollback: release all previously acquired locks in this call
        for j = 1, #acquired do
            redis.call('DEL', acquired[j])
        end
        return 0
    end
    table.insert(acquired, key)
end

return 1
