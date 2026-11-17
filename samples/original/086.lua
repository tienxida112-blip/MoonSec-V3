-- MoonSec V3 sample 086
-- Matrix-chain order DP (min multiplies)
local p = {10, 20, 5, 8, 15, 4}
local n = #p - 1
local dp = {}
for i = 1, n do dp[i] = {}; for j = 1, n do dp[i][j] = 0 end end
for L = 2, n do
  for i = 1, n-L+1 do
    local j = i+L-1
    dp[i][j] = 1e18
    for k = i, j-1 do
      local q = dp[i][k] + dp[k+1][j] + p[i]*p[k+1]*p[j+1]
      if q < dp[i][j] then dp[i][j] = q end
    end
  end
end
print(dp[1][n])

