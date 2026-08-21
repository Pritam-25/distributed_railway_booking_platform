-- KEYS: seat lock keys
-- ARGV[1]: lockToken
-- Returns: number of locks released

local lockValue = ARGV[1]
local released = 0

for i, key in ipairs(KEYS) do
    local current = redis.call('GET', key)
    if current == lockValue then
        redis.call('DEL', key)
        released = released + 1
    end
end

return released
