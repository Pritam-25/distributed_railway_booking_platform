--[[
  Atomic Redis Lua script implementing the token bucket algorithm.

  Uses redis.call("TIME") for a single authoritative clock so multi-node
  deployments refill tokens against the same timeline regardless of
  application-instance clock skew.

  KEYS[1] = rate limit key (e.g. "rl:user:123")
  ARGV[1] = capacity (maximum burst size / tokens in the bucket)
  ARGV[2] = refillPerSec (tokens added per second)

  Returns: { allowed (0|1), remaining (int), resetMs (int) }
--]]

-- 1. Extract parameters passed from the application
local key          = KEYS[1]
local capacity     = tonumber(ARGV[1])
local refillPerSec = tonumber(ARGV[2])

-- 2. Use Redis server time as the single authoritative clock to prevent application instance clock skew
local timeResult = redis.call("TIME")
local nowMs      = tonumber(timeResult[1]) * 1000 + math.floor(tonumber(timeResult[2]) / 1000)

-- 3. Retrieve the current bucket state (tokens and last refill timestamp) from Redis hash
local tokens     = tonumber(redis.call("HGET", key, "tokens"))
local lastRefill = tonumber(redis.call("HGET", key, "lastRefill"))

-- 4. If the key doesn't exist, initialize the bucket to full capacity
if tokens == nil then
  tokens     = capacity
  lastRefill = nowMs
end

-- 5. Calculate how many tokens have accumulated since the last check
local elapsedMs  = math.max(0, nowMs - lastRefill)
local elapsedSec = elapsedMs / 1000.0
local refill     = elapsedSec * refillPerSec

-- 6. Add refilled tokens to the bucket, capping it at maximum capacity
tokens       = math.min(capacity, tokens + refill)
lastRefill   = nowMs

-- 7. Initialize response fields
local allowed   = 0
local remaining = math.floor(tokens)
local resetMs   = 0

-- 8. Check if there is at least one token available to allow the current request
if tokens >= 1 then
  -- Consume 1 token and allow the request
  tokens    = tokens - 1
  allowed   = 1
  remaining = math.floor(tokens)
else
  -- Rate limit the request, and calculate how long (in ms) until the user has 1 token
  local deficit = 1 - tokens
  resetMs = math.ceil((deficit / refillPerSec) * 1000)
end

-- 9. Persist the updated bucket state back to the Redis hash
redis.call("HSET", key, "tokens", tostring(tokens), "lastRefill", tostring(lastRefill))

-- 10. Calculate bucket TTL (time to completely refill from empty + 1s buffer) and set it on the key to save Redis memory
local ttlSec = math.ceil(capacity / refillPerSec) + 1
redis.call("EXPIRE", key, ttlSec)

-- 11. Return authorization status, remaining capacity, and retry delay to the caller
return { allowed, remaining, resetMs }