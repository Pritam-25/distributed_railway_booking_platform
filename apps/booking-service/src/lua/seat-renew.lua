-- KEYS: seat lock keys
-- ARGV[1]: lockToken
-- ARGV[2]: ttl in seconds
-- Returns: 1 if all locks renewed, 0 otherwise

local lockValue = ARGV[1]
local ttl = tonumber(ARGV[2])

-- First verify all keys are owned by the lockValue
for i, key in ipairs(KEYS) do
    local current = redis.call('GET', key)
    if current ~= lockValue then
        return 0
    end
end

-- Apply the new TTL
for i, key in ipairs(KEYS) do
    redis.call('EXPIRE', key, ttl)
end

return 1
