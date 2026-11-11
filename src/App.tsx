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
import ClaimsInfo from "./pages/public/ClaimsInfo";
import Products from "./pages/public/Products";
import ProductDetail from "./pages/public/ProductDetail";
import Promotions, { PackageDetail } from "./pages/public/Promotions";
import { CartProvider } from "./lib/cart";
import NotFound from "./pages/public/NotFound";
import Portfolio, { PortfolioDetail } from "./pages/public/Portfolio";
import Privacy from "./pages/public/Privacy";
import Team from "./pages/public/Team";
import Training from "./pages/public/Training";
import VerifyCert from "./pages/public/VerifyCert";
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
const MyTraining = lazy(() => import("./pages/app/training/MyTraining"));
const Book = lazy(() => import("./pages/app/training/Book"));
const CheckIn = lazy(() => import("./pages/app/training/CheckIn"));
const Points = lazy(() => import("./pages/app/Points"));
const TrainingAdmin = lazy(() => import("./pages/app/admin/training/TrainingAdmin"));
const CompanyPoints = lazy(() => import("./pages/app/admin/CompanyPoints"));
const PointsAdmin = lazy(() => import("./pages/app/admin/PointsAdmin"));
const MyClaims = lazy(() => import("./pages/app/claims/MyClaims"));
const NewClaim = lazy(() => import("./pages/app/claims/NewClaim"));
const ClaimsAdmin = lazy(() => import("./pages/app/admin/claims/ClaimsAdmin"));
const DeliveriesAdmin = lazy(() => import("./pages/app/admin/deliveries/DeliveriesAdmin"));
const Reports = lazy(() => import("./pages/app/admin/Reports"));

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
            <Route path="training" element={<Training />} />
            <Route path="verify" element={<VerifyCert />} />
            <Route path="verify/:certNo" element={<VerifyCert />} />
            <Route path="claims" element={<ClaimsInfo />} />
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
            <Route path="training" element={<MyTraining />} />
            <Route path="training/book" element={<Book />} />
            <Route path="training/book/:sessionId" element={<Book />} />
            <Route path="training/checkin" element={<CheckIn />} />
            <Route path="points" element={<Points />} />
            <Route path="claims" element={<MyClaims />} />
            <Route path="claims/new" element={<NewClaim />} />
            <Route path="admin/claims" element={<ClaimsAdmin />} />
            <Route path="admin/training" element={<TrainingAdmin />} />
            <Route path="admin/company-points" element={<CompanyPoints />} />
            <Route path="admin/points" element={<PointsAdmin />} />
            <Route path="admin/products" element={<ProductsAdmin />} />
            <Route path="admin/pricing" element={<Pricing />} />
            <Route path="admin/promotions" element={<PromotionsAdmin />} />
            <Route path="admin/stock" element={<StockAdmin />} />
            <Route path="admin/deliveries" element={<DeliveriesAdmin />} />
            <Route path="admin/reports" element={<Reports />} />
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
