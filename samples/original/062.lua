-- MoonSec V3 sample 062
-- Langton's ant on a torus
local W, H, STEPS = 21, 21, 400
local grid = {}
for y = 1, H do
  grid[y] = {}
  for x = 1, W do grid[y][x] = 0 end
end
local x, y, dir = 11, 11, 0
local dx, dy = {0,1,0,-1}, {-1,0,1,0}
for _ = 1, STEPS do
  local c = grid[y][x]
  if c == 0 then dir = (dir + 1) % 4 else dir = (dir + 3) % 4 end
  grid[y][x] = 1 - c
  x = (x + dx[dir+1] - 1) % W + 1
  y = (y + dy[dir+1] - 1) % H + 1
end
local black = 0
for yy = 1, H do for xx = 1, W do black = black + grid[yy][xx] end end
print(black, x, y, dir)

