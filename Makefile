# ════════════════════════════════════════════════════════════════════
#  میان‌بُرهای استقرار سامانه آفاق —  make help
# ════════════════════════════════════════════════════════════════════
SHELL := /bin/bash
DC    := docker compose
HTTPS := -f docker-compose.yml -f docker-compose.https.yml
STAMP := $(shell date +%Y-%m-%d_%H-%M)

.DEFAULT_GOAL := help
.PHONY: help up up-https build build-lowmem rebuild down stop restart logs logs-all ps health \
        migrate backup restore psql redis-cli shell update fresh clean env check-env swap mem

help: ## نمایش همین راهنما
	@echo ""
	@echo "  سامانه جامع آفاق — دستورهای آماده"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'
	@echo ""

env: ## ساخت فایل .env از روی نمونه (در صورت نبود)
	@test -f .env || (cp .env.prod.example .env && chmod 600 .env && echo "✓ فایل .env ساخته شد — رمزها را عوض کنید")
	@test -f .env && echo "✓ .env موجود است"
	@echo "⚠ سه سکرت POSTGRES_PASSWORD / AFAGH_APP_DB_PASSWORD / MINIO_ROOT_PASSWORD را از CHANGE_ME_* به مقادیر تصادفی تغییر دهید"

# P0-3: fail-fast روی سکرت‌های ناامن پیش از بالا آوردن سامانه.
# روی CHANGE_ME*/خالی همیشه خطا؛ روی پیش‌فرض‌های ضعیفِ compose هم خطا،
# مگر برای توسعهٔ محلی با ALLOW_WEAK_SECRETS=1 (مثلاً: ALLOW_WEAK_SECRETS=1 make up).
check-env: env ## بررسی سکرت‌های .env (fail-fast روی مقادیر ناامن)
	@bash -c 'set -a; . ./.env 2>/dev/null; set +a; \
	fail(){ echo "X سکرت ناامن: $$1"; exit 1; }; \
	for pair in "POSTGRES_PASSWORD:$${POSTGRES_PASSWORD:-}" "AFAGH_APP_DB_PASSWORD:$${AFAGH_APP_DB_PASSWORD:-}" "MINIO_ROOT_PASSWORD:$${MINIO_ROOT_PASSWORD:-}"; do \
	  name="$${pair%%:*}"; val="$${pair#*:}"; \
	  case "$$val" in ""|CHANGE_ME*|changeme*) fail "$$name (نمونه/خالی — در .env مقدار قوی بگذارید)";; esac; \
	done; \
	if [ "$${ALLOW_WEAK_SECRETS:-0}" != "1" ]; then \
	  for pair in "POSTGRES_PASSWORD:$${POSTGRES_PASSWORD:-}" "AFAGH_APP_DB_PASSWORD:$${AFAGH_APP_DB_PASSWORD:-}" "MINIO_ROOT_PASSWORD:$${MINIO_ROOT_PASSWORD:-}"; do \
	    name="$${pair%%:*}"; val="$${pair#*:}"; \
	    case "$$val" in afagh|afagh-app-pass|afagh_app|afagh-secret) fail "$$name (پیش‌فرض ضعیف «$$val» — عوضش کنید یا با ALLOW_WEAK_SECRETS=1 ادامه دهید)";; esac; \
	  done; \
	fi; \
	echo "✓ سکرت‌ها بررسی شدند"'

up: check-env ## بالا آوردن کل سامانه (بیلد در صورت نیاز)
	$(DC) up -d --build
	@echo "✓ سامانه روی http://localhost:$${APP_PORT:-8080} در حال اجراست"

up-https: check-env ## اجرا پشت Caddy با HTTPS خودکار (نیازمند DOMAIN در .env)
	$(DC) $(HTTPS) up -d --build

build: ## فقط ساخت ایمیج‌ها
	$(DC) build

mem: ## گزارش حافظه/swap سرور + سقف هیپ پیشنهادی بیلد (بدون تغییر سیستم)
	bash scripts/ensure-build-memory.sh --dry-run

swap: ## ساخت swap برای بیلد روی سرور کم‌حافظه (رفع «exit code: 137»)
	sudo bash scripts/ensure-build-memory.sh

build-lowmem: ## بیلد با هیپ ۱۵۳۶ مگابایت — سرور ۲ گیگی (اول make swap)
	NODE_MAX_OLD_SPACE=1536 $(DC) build

rebuild: ## ساخت ایمیج‌ها بدون کش و اجرای مجدد
	$(DC) build --no-cache
	$(DC) up -d

down: ## توقف و حذف کانتینرها (داده حفظ می‌شود)
	$(DC) down

stop: ## خاموش کردن موقت سرویس‌ها
	$(DC) stop

restart: ## ری‌استارت سرویس وب
	$(DC) restart app

logs: ## لاگ زندهٔ سرویس وب
	$(DC) logs -f --tail=100 app

logs-all: ## لاگ زندهٔ همهٔ سرویس‌ها
	$(DC) logs -f --tail=50

ps: ## وضعیت سرویس‌ها
	$(DC) ps

health: ## بررسی سلامت سامانه
	@$(DC) ps
	@echo -n "  HTTP /login → "; curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:$${APP_PORT:-8080}/login

migrate: ## اجرای دوبارهٔ مهاجرت دیتابیس (بعد از تغییر schema)
	$(DC) run --rm migrator

backup: ## پشتیبان‌گیری از PostgreSQL در پوشهٔ backups/
	@mkdir -p backups
	$(DC) exec -T postgres pg_dump -U afagh -d afagh_db > backups/afagh_$(STAMP).sql
	@echo "✓ backups/afagh_$(STAMP).sql"

restore: ## بازگردانی پشتیبان:  make restore FILE=backups/afagh_....sql
	@test -n "$(FILE)" || (echo "استفاده: make restore FILE=backups/afagh_....sql"; exit 1)
	cat $(FILE) | $(DC) exec -T postgres psql -U afagh -d afagh_db
	@echo "✓ بازگردانی انجام شد"

psql: ## کنسول تعاملی PostgreSQL
	$(DC) exec postgres psql -U afagh -d afagh_db

redis-cli: ## کنسول تعاملی Redis
	$(DC) exec redis redis-cli

shell: ## ورود به کانتینر سرویس وب
	$(DC) exec app sh

update: ## گرفتن آخرین کد، بیلد مجدد و ری‌استارت
	git pull --ff-only
	$(DC) build
	$(DC) up -d
	@echo "✓ به‌روزرسانی انجام شد"

fresh: ## ⚠️ حذف کامل کانتینرها و داده و نصب از صفر
	$(DC) down -v
	$(DC) up -d --build

clean: ## پاک‌سازی ایمیج‌ها و کش بلااستفادهٔ داکر
	docker image prune -f
	docker builder prune -f
