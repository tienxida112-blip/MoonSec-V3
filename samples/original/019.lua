-- MoonSec V3 sample 019
-- 0/1 knapsack
local w = {2,3,4,5,9,1,6}
local v = {3,4,8,8,10,1,7}
local W = 12
local dp = {}
for i = 0, W do dp[i] = 0 end
for i = 1, #w do
  for cap = W, w[i], -1 do
    local t = dp[cap-w[i]] + v[i]
    if t > dp[cap] then dp[cap] = t end
  end
end
print(dp[W])

