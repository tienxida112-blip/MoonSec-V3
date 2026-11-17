-- MoonSec V3 sample 020
-- Coin change combinations
local coins = {1,5,10,25}
local N = 40
local dp = {}
for i = 0, N do dp[i] = 0 end
dp[0] = 1
for _, c in ipairs(coins) do
  for x = c, N do dp[x] = dp[x] + dp[x-c] end
end
print(dp[N])

