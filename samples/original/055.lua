-- MoonSec V3 sample 055
-- Bresenham line raster count
local function line(x0,y0,x1,y1)
  local dx, dy = math.abs(x1-x0), -math.abs(y1-y0)
  local sx = x0 < x1 and 1 or -1
  local sy = y0 < y1 and 1 or -1
  local err, n = dx + dy, 0
  while true do
    n = n + 1
    if x0 == x1 and y0 == y1 then break end
    local e2 = 2 * err
    if e2 >= dy then err = err + dy; x0 = x0 + sx end
    if e2 <= dx then err = err + dx; y0 = y0 + sy end
  end
  return n
end
print(line(0,0,12,7) + line(2,9,15,1))

