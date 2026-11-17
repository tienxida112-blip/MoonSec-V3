-- MoonSec V3 sample 016
-- Rabin-Karp rolling hash
local s, p = "cabcabacabacabacab", "acab"
local base, mod = 256, 1000003
local n, m = #s, #p
local ph, sh, pow = 0, 0, 1
for i = 1, m do
  ph = (ph * base + p:byte(i)) % mod
  sh = (sh * base + s:byte(i)) % mod
  if i < m then pow = (pow * base) % mod end
end
local hits = 0
for i = 1, n - m + 1 do
  if ph == sh then
    local ok = true
    for k = 1, m do if s:byte(i+k-1) ~= p:byte(k) then ok = false break end end
    if ok then hits = hits + 1 end
  end
  if i <= n - m then
    sh = (sh - s:byte(i) * pow) % mod
    if sh < 0 then sh = sh + mod end
    sh = (sh * base + s:byte(i+m)) % mod
  end
end
print(hits)

