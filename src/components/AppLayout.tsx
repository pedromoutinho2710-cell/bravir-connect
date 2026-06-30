import { useState } from "react";
import { Outlet } from "react-router-dom";
import { Menu, Eye, X } from "lucide-react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { AppSidebar } from "./AppSidebar";
import { MobileNav } from "./MobileNav";
import { NotificationsBadge } from "./NotificationsBadge";
import { UserMenu } from "./UserMenu";
import { useImpersonation } from "@/contexts/ImpersonationContext";

export default function AppLayout() {
  const { active, userName, userRole, clearImpersonation } = useImpersonation();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        {/* Sidebar: visível apenas em md+ */}
        <div className="hidden md:flex">
          <AppSidebar />
        </div>

        <div className="flex-1 flex flex-col min-w-0">
          {/* Header sticky */}
          <header className="sticky top-0 z-40 h-14 flex items-center border-b bg-card px-4 gap-3">
            {/* Hamburguer mobile */}
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="md:hidden flex-shrink-0">
                  <Menu className="h-5 w-5" />
                  <span className="sr-only">Menu</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="p-0 w-64">
                <MobileNav onNavigate={() => setMobileOpen(false)} />
              </SheetContent>
            </Sheet>

            {/* Trigger sidebar desktop */}
            <div className="hidden md:flex">
              <SidebarTrigger />
            </div>

            {/* Logo oficial Bravir */}
            <div className="flex items-center flex-1 min-w-0">
              <img
                src="/bravir_logo.png"
                alt="Bravir — Cosmética e Farmacêutica"
                className="h-7 w-auto select-none"
                draggable={false}
              />
            </div>

            {/* Nome do usuário */}
            {active ? (
              <div className="flex items-center gap-2 ml-auto">
                <div className="flex items-center gap-1.5 bg-yellow-50 border border-yellow-300 text-yellow-800 rounded-md px-2.5 py-1 text-xs font-medium">
                  <Eye className="h-3.5 w-3.5 flex-shrink-0" />
                  <span className="hidden sm:inline">Visualizando como </span>
                  <span className="font-semibold">{userName}</span>
                  <span className="hidden sm:inline text-yellow-600">({userRole})</span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearImpersonation}
                  className="h-7 px-2 text-yellow-800 hover:bg-yellow-100 border border-yellow-300"
                >
                  <X className="h-3.5 w-3.5 mr-1" />
                  <span className="hidden sm:inline text-xs">Sair</span>
                </Button>
              </div>
            ) : (
              <div className="ml-auto">
                <UserMenu variant="compact" />
              </div>
            )}

            <NotificationsBadge />
          </header>

          <main className="flex-1 p-4 md:p-6">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
