-- MoonSec V3 sample 097
-- LU-lite 3x3 (no pivoting) then residual
local A = {{2,1,1},{4,-6,0},{-2,7,2}}
local n = 3
local L, U = {}, {}
for i = 1, n do
  L[i] = {}; U[i] = {}
  for j = 1, n do L[i][j]=0; U[i][j]=0 end
end
for i = 1, n do
  for k = i, n do
    local s = 0
    for j = 1, i-1 do s = s + L[i][j]*U[j][k] end
    U[i][k] = A[i][k] - s
  end
  for k = i, n do
    if i == k then L[i][i] = 1
    else
      local s = 0
      for j = 1, i-1 do s = s + L[k][j]*U[j][i] end
      L[k][i] = (A[k][i] - s) / U[i][i]
    end
  end
end
local s = 0
for i = 1, n do for j = 1, n do s = s + L[i][j]*10 + U[i][j] end end
print(math.floor(s*1000+0.5))

