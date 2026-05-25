default:
    @just --list

install:
    npm install

dev:
    npm run dev

start:
    npm run start

build:
    npm run build

format:
    npm run format

lint:
    npm run lint

type:
    npm run typecheck

check:
    npm run check

all: check build

precommit:
    prek run -a

db-generate:
    npm run db:generate

db-migrate:
    npm run db:migrate

db-push:
    npm run db:push

db-seed:
    npm run db:seed

workouts-export-csv:
    npm run workouts:export-csv

workouts-import-csv:
    npm run workouts:import-csv
