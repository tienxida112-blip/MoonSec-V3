local v=function(n)return game:GetService(n)end;
local b,c,d,e=v"ReplicatedStorage",v"CollectionService",v"RunService",v"UserInputService";
local f=v("Players").LocalPlayer;
local q={};
local m=nil;pcall(function()m=require(b:WaitForChild"FlowClient")end);
local n=function()end;
local o=m and m.PlayerDamage and m.PlayerDamage.TakeDamage;
local p=m and m.Passout and m.Passout.Abandon;
local s=function()if o and m and m.PlayerDamage then m.PlayerDamage.TakeDamage=n end;if p and m and m.Passout then m.Passout.Abandon=n end;local A=f.Character;local B=A and A:FindFirstChildOfClass"Humanoid";if B then if not q[B]then q[B]={b=B.BreakJointsOnDeath,n=B.RequiresNeck,d=B:GetStateEnabled(Enum.HumanoidStateType.Dead)}end;B.BreakJointsOnDeath=false;B.RequiresNeck=false;B:SetStateEnabled(Enum.HumanoidStateType.Dead,false);B.Health=B.MaxHealth end end;local t=function()if m and m.PlayerDamage and m.PlayerDamage.TakeDamage==n then m.PlayerDamage.TakeDamage=o end;if m and m.Passout and m.Passout.Abandon==n then m.Passout.Abandon=p end;for A,B in pairs(q)do if A.Parent then A.BreakJointsOnDeath=B.b;A.RequiresNeck=B.n;A:SetStateEnabled(Enum.HumanoidStateType.Dead,B.d)end;q[A]=nil end end;

s()
print("s ok", f.Character.Health)
t()
print("t ok")
