-- MoonSec V3 sample 060
-- 4x4 sudoku solver, count solutions of a puzzle
local g = {
  1,0,0,4,
  0,0,1,0,
  0,4,0,0,
  3,0,0,2,
}
local function ok(i, v)
  local r, c = math.floor((i-1)/4), (i-1)%4
  for k = 0, 3 do
    if g[r*4+k+1] == v then return false end
    if g[k*4+c+1] == v then return false end
  end
  local br, bc = math.floor(r/2)*2, math.floor(c/2)*2
  for dr = 0, 1 do for dc = 0, 1 do
    if g[(br+dr)*4 + bc+dc+1] == v then return false end
  end end
  return true
end
local sols = 0
local function solve(i)
  if i > 16 then sols = sols + 1; return end
  if g[i] ~= 0 then solve(i+1); return end
  for v = 1, 4 do
    if ok(i, v) then g[i] = v; solve(i+1); g[i] = 0 end
  end
end
solve(1)
print(sols)

