local function noop() end
local m = {PlayerDamage={TakeDamage=noop}, Passout={Abandon=noop}}
local n = function() end
local o = m.PlayerDamage.TakeDamage
local p = m.Passout.Abandon
local q = {}
local f = {Character = {FindFirstChildOfClass=function(_, c)
  return {BreakJointsOnDeath=true, RequiresNeck=true, Health=100, MaxHealth=120,
          GetStateEnabled=function() return true end, SetStateEnabled=noop}
end}}
local Enum = setmetatable({}, {__index=function(t,k) return setmetatable({}, {__index=function(_,x) return x end}) end})

local s = function()
  if o and m and m.PlayerDamage then m.PlayerDamage.TakeDamage = n end
  if p and m and m.Passout then m.Passout.Abandon = n end
  local A = f.Character
  local B = A and A:FindFirstChildOfClass("Humanoid")
  if B then
    if not q[B] then
      q[B] = {b = B.BreakJointsOnDeath, n = B.RequiresNeck, d = B:GetStateEnabled(Enum.HumanoidStateType.Dead)}
    end
    B.BreakJointsOnDeath = false
    B.RequiresNeck = false
    B:SetStateEnabled(Enum.HumanoidStateType.Dead, false)
    B.Health = B.MaxHealth
  end
end
s()
print("s done", f.Character.Health)
