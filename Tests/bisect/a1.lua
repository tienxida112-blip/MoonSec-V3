local q = {}
local function s()
  local B = {x = 1}
  if B then
    if not q[B] then q[B] = {v = B.x} end
  end
end
local function t() for k in pairs(q) do q[k] = nil end end
local g = {G = false}
local function setG(v)
  g.G = v
  if v then s() else t() end
end
setG(true)
setG(false)
print("a1 ok")
