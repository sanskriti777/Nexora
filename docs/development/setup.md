# NEXORA Local Development Setup Guide

## 1. Prerequisites
- **Node.js**: v18.0.0 or higher
- **PHP**: v8.2.0 or higher with PDO, OpenSSL, Mbstring, and Redis extensions enabled
- **Composer**: v2.0 or higher
- **MySQL**: v8.0 or higher running on `localhost:3306`
- **MongoDB**: v6.0 or higher running on `localhost:27017`
- **Redis**: v6.0 or higher running on `localhost:6379`

---

## 2. Component Setup (Planned for Phases 2 - 10)

### Backend (Laravel)
```bash
cd backend
composer install
cp .env.example .env
php artisan key:generate
# Configure DB_DATABASE=nexora_db in .env
php artisan migrate --seed
php artisan serve
```

### Real-Time Server (Node.js)
```bash
cd realtime-server
npm install
# Configure MONGO_URI=mongodb://127.0.0.1:27017/nexora_chat in .env
npm run dev
```

### Frontend (React + Vite)
```bash
cd frontend
npm install
npm run dev
```
