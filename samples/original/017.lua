-- MoonSec V3 sample 017
-- Longest common subsequence
local a, b = "AGGTABXYZ", "GXTXAYBZZ"
local n, m = #a, #b
local dp = {}
for i = 0, n do dp[i] = {}; for j = 0, m do dp[i][j] = 0 end end
for i = 1, n do
  for j = 1, m do
    if a:sub(i,i) == b:sub(j,j) then dp[i][j] = dp[i-1][j-1] + 1
    else dp[i][j] = math.max(dp[i-1][j], dp[i][j-1]) end
  end
end
print(dp[n][m])

