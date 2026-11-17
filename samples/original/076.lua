-- MoonSec V3 sample 076
-- Sparse matrix-vector multiply
local N, NZ = 12, 30
local st = 88
local function rnd() st = st * 48271 % 2147483647; return st end
local row, col, val, x, y = {}, {}, {}, {}, {}
for i = 1, N do x[i] = (rnd() % 21) - 10; y[i] = 0 end
for k = 1, NZ do
  row[k] = 1 + (rnd() % N)
  col[k] = 1 + (rnd() % N)
  val[k] = (rnd() % 9) - 4
end
for k = 1, NZ do y[row[k]] = y[row[k]] + val[k] * x[col[k]] end
local s = 0
for i = 1, N do s = s + y[i] * y[i] end
print(s)

