-- MoonSec V3 sample 034
-- Binary exponentiation + miller-rabin-ish witness
local function mpow(b, e, m)
  local r = 1 % m
  b = b % m
  while e > 0 do
    if e % 2 == 1 then r = (r * b) % m end
    b = (b * b) % m
    e = math.floor(e / 2)
  end
  return r
end
local n, a = 104729, 2
local ok = mpow(a, n-1, n) == 1
print(mpow(3, 20, 1000003), ok and 1 or 0)

