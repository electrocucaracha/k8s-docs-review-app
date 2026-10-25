import type { Workspace } from "./review";

const introduction =
  "A Deployment manages a set of Pods to run an application workload, usually one that does not maintain state.";

export const sample: Workspace = {
  name: "Example workspace",
  complete: true,
  paths: [
    "content/en/docs/concepts/workloads/pods.md",
    "content/es/docs/concepts/workloads/pods.md",
  ],
  documents: [
    {
      path: "content/en/docs/concepts/workloads/deployments.md",
      content: `---
title: Deployments
weight: 10
---

# Deployments

${introduction}

## Before you begin {#before-you-begin}

You need a Kubernetes cluster and the kubectl command-line tool.

Read about [Pods](/docs/concepts/workloads/pods/).

## Create a Deployment {#create-deployment}

Create a Deployment with two replicas:

\`\`\`shell
kubectl create deployment nginx --image=nginx:1.25 --replicas=2
\`\`\`

Check the rollout status before continuing.

## Update a Deployment {#update-deployment}

Update the container image and check its rollout status.

[Update strategy](#update-deployment)

## What's next {#whats-next}

Learn more about [Pods](/docs/concepts/workloads/pods/).
`,
    },
    {
      path: "content/es/docs/concepts/workloads/deployments.md",
      content: `---
title: Deployments
weight: 10
---

# Deployments

${introduction}

## Antes de comenzar {#before-you-begin}

Necesitas un clúster de Kubernetes y la herramienta de línea de comandos kubectl.

Consulta la documentación de [Pods](/docs/concepts/workloads/pods/).

## Crear un Deployment {#create-deployment}

Crea un Deployment con dos réplicas:

\`\`\`shell
kubectl create deployment nginx --image=nginx:1.25 --replicas=3
\`\`\`

## Actualizar un Deployment {#update-deployment}

Actualiza la imagen del contenedor y comprueba el estado del despliegue.

[Estrategia de actualización](#actualizar-deployment)

## Próximos pasos {#whats-next}

Consulta la [guía de escalado](/docs/tasks/missing-scaling-guide/).
`,
    },
    {
      path: "content/en/docs/concepts/workloads/pods.md",
      content:
        "# Pods\n\nPods are the smallest deployable units in Kubernetes.\n",
    },
    {
      path: "content/es/docs/concepts/workloads/pods.md",
      content:
        "# Pods\n\nLos Pods son las unidades desplegables más pequeñas de Kubernetes.\n",
    },
  ],
};
