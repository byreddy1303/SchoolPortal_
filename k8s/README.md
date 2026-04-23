# Kubernetes Deployment Guide

This directory contains manifests to run the complete project on Kubernetes:

- `frontend` Deployment + Service
- `backend` Deployment + Service
- migration Job for Alembic
- Ingress routing `/` to frontend and `/api` to backend

## 1) Build and push images

Replace image names in manifests if you use a different registry.

Backend:

```powershell
docker build -t ghcr.io/rohithreddy999/school-portal-backend:latest ./backend
docker push ghcr.io/rohithreddy999/school-portal-backend:latest
```

Frontend:

```powershell
docker build --build-arg VITE_SESSION_TIMEOUT_MINUTES=15 -t ghcr.io/rohithreddy999/school-portal-frontend:latest ./frontend
docker push ghcr.io/rohithreddy999/school-portal-frontend:latest
```

## 2) Configure environment values

1. Copy `02-secret.example.yaml` to `02-secret.yaml`.
2. Edit `02-secret.yaml` with real values:
   - `DATABASE_URL` (Neon URL)
   - `SECRET_KEY`
   - `DEFAULT_ADMIN_PASSWORD`
3. Update `01-configmap.yaml`:
   - `BACKEND_CORS_ORIGINS` to your ingress domain.
4. Update `08-ingress.yaml`:
   - set `host` to your real domain.

## 3) Deploy manifests

```powershell
kubectl apply -f k8s/00-namespace.yaml
kubectl apply -f k8s/01-configmap.yaml
kubectl apply -f k8s/02-secret.yaml
kubectl apply -f k8s/04-backend-service.yaml
kubectl apply -f k8s/06-frontend-service.yaml
kubectl apply -f k8s/03-backend-deployment.yaml
kubectl apply -f k8s/05-frontend-deployment.yaml
kubectl apply -f k8s/08-ingress.yaml
```

## 4) Run migrations

```powershell
kubectl delete job backend-migrations -n school-portal --ignore-not-found
kubectl apply -f k8s/07-migration-job.yaml
kubectl logs -n school-portal job/backend-migrations -f
```

## 5) Verify

```powershell
kubectl get pods,svc,ingress -n school-portal
kubectl rollout status deployment/backend -n school-portal
kubectl rollout status deployment/frontend -n school-portal
```

If image pulls fail on private registries, create and attach an `imagePullSecret` to the Deployments and Job.
