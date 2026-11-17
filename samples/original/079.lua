-- MoonSec V3 sample 079
-- Manacher odd-palindrome radius sum
local s = "abacabaabcba"
local n = #s
local rad, sum = {}, 0
for i = 1, n do
  local r = 0
  while i-r >= 1 and i+r <= n and s:sub(i-r,i-r) == s:sub(i+r,i+r) do r = r + 1 end
  rad[i] = r - 1
  sum = sum + rad[i]
end
print(sum, rad[4])

