import { lazy, Suspense } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import AppLayout from "./components/AppLayout";
import PublicLayout from "./components/PublicLayout";
import { AuthProvider } from "./lib/auth";
import ForgotPassword from "./pages/auth/ForgotPassword";
import Login from "./pages/auth/Login";
import Register from "./pages/auth/Register";
import ResetPassword from "./pages/auth/ResetPassword";
import About from "./pages/public/About";
import Contact from "./pages/public/Contact";
import Home from "./pages/public/Home";
import ModulePage from "./pages/public/ModulePage";
import Products from "./pages/public/Products";
import ProductDetail from "./pages/public/ProductDetail";
import Promotions, { PackageDetail } from "./pages/public/Promotions";
import { CartProvider } from "./lib/cart";
import NotFound from "./pages/public/NotFound";
import Portfolio, { PortfolioDetail } from "./pages/public/Portfolio";
import Privacy from "./pages/public/Privacy";
import Team from "./pages/public/Team";
import { Loading } from "./components/ui";

// back-office pages load on demand so the public site stays light
const Dashboard = lazy(() => import("./pages/app/Dashboard"));
const Profile = lazy(() => import("./pages/app/Profile"));
const Companies = lazy(() => import("./pages/app/admin/Companies"));
const Content = lazy(() => import("./pages/app/admin/Content"));
const Logs = lazy(() => import("./pages/app/admin/Logs"));
const Messages = lazy(() => import("./pages/app/admin/Messages"));
const PortfolioAdmin = lazy(() => import("./pages/app/admin/PortfolioAdmin"));
const TeamAdmin = lazy(() => import("./pages/app/admin/TeamAdmin"));
const Users = lazy(() => import("./pages/app/admin/Users"));
const Cart = lazy(() => import("./pages/app/Cart"));
const MyRequests = lazy(() => import("./pages/app/MyRequests"));
const ProductsAdmin = lazy(() => import("./pages/app/admin/ProductsAdmin"));
const Pricing = lazy(() => import("./pages/app/admin/Pricing"));
const PromotionsAdmin = lazy(() => import("./pages/app/admin/PromotionsAdmin"));
const StockAdmin = lazy(() => import("./pages/app/admin/StockAdmin"));
const RequestsAdmin = lazy(() => import("./pages/app/admin/RequestsAdmin"));

export default function App() {
  return (
    <AuthProvider>
      <CartProvider>
      <BrowserRouter>
        <Suspense fallback={<Loading />}>
        <Routes>
          <Route element={<PublicLayout />}>
            <Route index element={<Home />} />
            <Route path="about" element={<About />} />
            <Route path="portfolio" element={<Portfolio />} />
            <Route path="portfolio/:id" element={<PortfolioDetail />} />
            <Route path="team" element={<Team />} />
            <Route path="contact" element={<Contact />} />
            <Route path="privacy" element={<Privacy />} />
            <Route path="products" element={<Products />} />
            <Route path="products/:slug" element={<ProductDetail />} />
            <Route path="promotions" element={<Promotions />} />
            <Route path="packages/:slug" element={<PackageDetail />} />
            <Route path="training" element={<ModulePage module="training" />} />
            <Route path="claims" element={<ModulePage module="claims" />} />
            <Route path="*" element={<NotFound />} />
          </Route>
          <Route path="login" element={<Login />} />
          <Route path="register" element={<Register />} />
          <Route path="forgot-password" element={<ForgotPassword />} />
          <Route path="reset-password" element={<ResetPassword />} />
          <Route path="app" element={<AppLayout />}>
            <Route index element={<Dashboard />} />
            <Route path="profile" element={<Profile />} />
            <Route path="cart" element={<Cart />} />
            <Route path="requests" element={<MyRequests />} />
            <Route path="admin/products" element={<ProductsAdmin />} />
            <Route path="admin/pricing" element={<Pricing />} />
            <Route path="admin/promotions" element={<PromotionsAdmin />} />
            <Route path="admin/stock" element={<StockAdmin />} />
            <Route path="admin/requests" element={<RequestsAdmin />} />
            <Route path="admin/users" element={<Users />} />
            <Route path="admin/companies" element={<Companies />} />
            <Route path="admin/messages" element={<Messages />} />
            <Route path="admin/content" element={<Content />} />
            <Route path="admin/portfolio" element={<PortfolioAdmin />} />
            <Route path="admin/team" element={<TeamAdmin />} />
            <Route path="admin/logs" element={<Logs />} />
          </Route>
        </Routes>
        </Suspense>
      </BrowserRouter>
      </CartProvider>
    </AuthProvider>
  );
}
