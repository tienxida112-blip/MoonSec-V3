-- MoonSec V3 sample 081
-- Chinese remainder theorem two moduli
local function egcd(a,b)
  if b == 0 then return a,1,0 end
  local g,x,y = egcd(b, a%b)
  return g, y, x - math.floor(a/b)*y
end
local function crt(a1,m1,a2,m2)
  local g, x = egcd(m1, m2)
  local m = m1 * m2
  local t = (a2 - a1) * x % m2
  return (a1 + m1 * t) % m
end
print(crt(2,3,3,5), crt(1,7,3,11))

