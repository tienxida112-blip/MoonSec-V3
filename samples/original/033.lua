-- MoonSec V3 sample 033
-- Extended Euclidean + modular inverse
local function egcd(a, b)
  if b == 0 then return a, 1, 0 end
  local g, x, y = egcd(b, a % b)
  return g, y, x - math.floor(a/b) * y
end
local g, x, y = egcd(240, 46)
local inv, _g, xi = nil, egcd(17, 3120)
local function modinv(a, m)
  local g, x = egcd(a, m)
  if g ~= 1 then return nil end
  return (x % m + m) % m
end
print(g, x, y, modinv(17, 3120))

