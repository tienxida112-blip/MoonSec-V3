-- MoonSec V3 sample 092
-- Treap-like implicit split size checksum (cartesian tree)
local keys = {5,2,8,1,7,3,9,4,6}
local prio = {3,9,1,8,2,7,4,6,5}
local function build(lo, hi)
  if lo > hi then return nil end
  local m = lo
  for i = lo+1, hi do if prio[i] < prio[m] then m = i end end
  return {k=keys[m], p=prio[m], l=build(lo,m-1), r=build(m+1,hi)}
end
local root = build(1, #keys)
local sum = 0
local function walk(n, d)
  if not n then return end
  sum = sum + n.k * (d+1)
  walk(n.l, d+1); walk(n.r, d+1)
end
walk(root, 0)
print(sum)

