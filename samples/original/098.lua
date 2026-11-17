-- MoonSec V3 sample 098
-- Pollard Rho-lite gcd loop on n=8051
local function gcd(a,b) while b ~= 0 do a,b = b, a%b end; return a end
local n = 8051
local x, y, d, c = 2, 2, 1, 1
local function f(v) return (v*v + c) % n end
local steps = 0
while d == 1 do
  x = f(x); y = f(f(y))
  d = gcd(math.abs(x-y), n)
  steps = steps + 1
  if steps > 200 then break end
end
print(d, steps)

