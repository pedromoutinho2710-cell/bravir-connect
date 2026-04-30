import { useState } from "react";
import { Outlet } from "react-router-dom";
import { Menu } from "lucide-react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { AppSidebar } from "./AppSidebar";
import { MobileNav } from "./MobileNav";
import { useAuth } from "@/hooks/useAuth";

export default function AppLayout() {
  const { fullName, user } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const displayName = fullName || user?.email?.split("@")[0] || "";

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

            {/* Logo / título */}
            <span className="font-bold text-primary tracking-tight text-base flex-1">
              Bravir CRM
            </span>

            {/* Nome do usuário */}
            {displayName && (
              <span className="text-sm text-muted-foreground hidden sm:block truncate max-w-[160px]">
                {displayName}
              </span>
            )}
          </header>

          <main className="flex-1 p-4 md:p-6">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
