-- KEYS: seat lock keys (booking:lock:seat:{scheduleId}:{seatId})
-- ARGV[1]: lockToken (random UUID)
-- ARGV[2]: ttl in seconds (e.g. 600s for 10 min)
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
