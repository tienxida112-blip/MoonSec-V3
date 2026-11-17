-- MoonSec V3 sample 038
-- Discrete cosine of a short signal
local x = {1,2,3,4,5,6,7,8}
local N = #x
local X = {}
for k = 0, N-1 do
  local s = 0
  for n = 0, N-1 do
    s = s + x[n+1] * math.cos(math.pi / N * (n + 0.5) * k)
  end
  X[k+1] = s
end
local h = 0
for i = 1, N do h = h + math.floor(X[i] * 100 + 0.5) * i end
print(h)

