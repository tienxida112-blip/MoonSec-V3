-- MoonSec V3 sample 036
-- Gaussian elimination 3x3
local A = {
  {2,1,-1,8},
  {-3,-1,2,-11},
  {-2,1,2,-3},
}
local n = 3
for k = 1, n do
  local piv = k
  for i = k+1, n do if math.abs(A[i][k]) > math.abs(A[piv][k]) then piv = i end end
  A[k], A[piv] = A[piv], A[k]
  for i = k+1, n do
    local f = A[i][k] / A[k][k]
    for j = k, n+1 do A[i][j] = A[i][j] - f * A[k][j] end
  end
end
local x = {}
for i = n, 1, -1 do
  local s = A[i][n+1]
  for j = i+1, n do s = s - A[i][j] * x[j] end
  x[i] = s / A[i][i]
end
print(x[1], x[2], x[3])

