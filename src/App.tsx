import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Suspense, lazy } from "react";
import { BrowserRouter, Routes, Route, Navigate, Outlet } from "react-router-dom";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { ChatProvider } from "@/context/ChatContext";
import { DMProvider } from "@/context/DMContext";
import { VoiceProvider } from "@/context/VoiceContext";
import GlobalAlertModalProvider from "@/components/system/GlobalAlertModalProvider";
import { AuthGateSkeleton } from "@/components/skeletons/AppSkeletons";

const queryClient = new QueryClient();
const Index = lazy(() => import("./pages/Index"));
const AuthPage = lazy(() => import("./pages/AuthPage"));
const NotFound = lazy(() => import("./pages/NotFound"));
const ServerSettingsPage = lazy(() => import("./pages/ServerSettingsPage"));
const DiscoverPage = lazy(() => import("./pages/DiscoverPage"));
const ProfilePage = lazy(() => import("./pages/ProfilePage"));

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  if (loading) return <AuthGateSkeleton />;
  if (!user) return <Navigate to="/auth" replace />;
  return <>{children}</>;
};

const AuthRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  if (loading) return <AuthGateSkeleton />;
  if (user) return <Navigate to="/" replace />;
  return <>{children}</>;
};

const ProtectedAppLayout = () => (
  <ProtectedRoute>
    <ChatProvider>
      <VoiceProvider>
        <DMProvider>
          <Outlet />
        </DMProvider>
      </VoiceProvider>
    </ChatProvider>
  </ProtectedRoute>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <GlobalAlertModalProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Suspense fallback={<AuthGateSkeleton />}>
              <Routes>
                <Route path="/auth" element={<AuthRoute><AuthPage /></AuthRoute>} />
                <Route element={<ProtectedAppLayout />}>
                  <Route path="/" element={<Index />} />
                  <Route path="/discover" element={<DiscoverPage />} />
                  <Route path="/servers/:serverId/settings" element={<ServerSettingsPage />} />
                  <Route path="/profile/:userId" element={<ProfilePage />} />
                </Route>
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
        </TooltipProvider>
      </GlobalAlertModalProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
