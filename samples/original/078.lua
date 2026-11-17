-- MoonSec V3 sample 078
-- Levenshtein distance
local function randstr(seed, n)
  local t, s = {}, seed
  for i = 1, n do s = s * 48271 % 2147483647; t[i] = 97 + (s % 6) end
  return t
end
local a, b = randstr(13579, 22), randstr(24680, 20)
local n, m = #a, #b
local dp = {}
for i = 0, n do dp[i] = {}; dp[i][0] = i end
for j = 0, m do dp[0][j] = j end
for i = 1, n do
  for j = 1, m do
    local c = (a[i] == b[j]) and 0 or 1
    dp[i][j] = math.min(dp[i-1][j]+1, dp[i][j-1]+1, dp[i-1][j-1]+c)
  end
end
print(dp[n][m])

