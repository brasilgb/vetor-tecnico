# API Mobile VetorOS

Documento para integrar um app mobile com a API do VetorOS.

## Base

Base URL:

```text
https://seu-dominio.com.br/api
```

Em desenvolvimento local, use a URL exposta pelo Laravel, por exemplo:

```text
http://127.0.0.1:8000/api
```

Headers padrao para rotas autenticadas:

```http
Accept: application/json
Content-Type: application/json
Authorization: Bearer {access_token}
```

O tenant nao deve ser enviado manualmente pelo app. A API identifica o tenant pelo usuario autenticado via Sanctum, usando `users.tenant_id`. Todos os models tenant-aware sao filtrados por esse tenant no backend.

## Fluxo Recomendado

1. Fazer login em `POST /loginuser`.
2. Salvar localmente `access_token`, usuario retornado e dados da empresa (`company`).
3. Usar `result.tenant_id` como chave local de cache/sincronizacao.
4. Buscar listas auxiliares:
   - `GET /clientes`
   - `GET /orcamentos/filtros`
5. Para pre-cadastro, enviar `POST /clientes/pre-cadastro`.
6. Para orcamento, seguir o fluxo:
   - selecionar equipamento em `GET /orcamentos/filtros`
   - buscar modelos em `GET /orcamentos/modelos?equipment_id={id}`
   - buscar servicos em `GET /orcamentos/servicos?equipment_id={id}&model={modelo}`
   - buscar dados finais em `GET /orcamentos?equipment_id={id}&model={modelo}&service={servico}`
7. Ao trocar usuario ou tenant, limpar o cache local do tenant anterior.

Sugestao de estrutura local no app:

```json
{
  "session": {
    "access_token": "token",
    "user": {
      "id": 10,
      "tenant_id": 3,
      "name": "Usuario"
    },
    "company": {
      "name": "Minha Empresa",
      "logo": "1717000000.png",
      "logo_url": "https://seu-dominio.com.br/storage/logos/1717000000.png"
    }
  },
  "tenants": {
    "3": {
      "clientes": [],
      "equipamentos": [],
      "models_by_equipment": {},
      "relatorios_equipamentos": {}
    }
  }
}
```

## Login

Endpoint:

```http
POST /api/loginuser
```

Payload:

```json
{
  "email": "usuario@example.com",
  "password": "password"
}
```

Sucesso `200`:

```json
{
  "success": true,
  "access_token": "1|plain-text-token",
  "result": {
    "id": 1,
    "tenant_id": 3,
    "user_number": 1,
    "name": "Usuario",
    "email": "usuario@example.com",
    "roles": 2,
    "status": 1
  },
  "company": {
    "name": "Minha Empresa",
    "logo": "1717000000.png",
    "logo_url": "https://seu-dominio.com.br/storage/logos/1717000000.png"
  }
}
```

Erro de credenciais `401`:

```json
{
  "success": false,
  "result": []
}
```

Erro de validacao `422`:

```json
{
  "message": "The email field is required.",
  "errors": {
    "email": ["The email field is required."]
  }
}
```

## Logout

Endpoint:

```http
GET /api/logoutuser
```

Sucesso `200`:

```json
{
  "message": "logged out"
}
```

Apos logout, apague `access_token` e dados locais sensiveis.

## Clientes

### Listar Clientes

Endpoint:

```http
GET /api/clientes
```

Permissao necessaria: `customers`.

Sucesso `200`:

```json
{
  "success": true,
  "result": [
    {
      "id": 15,
      "tenant_id": 3,
      "customer_number": 1,
      "name": "Cliente",
      "cpfcnpj": "12345678900",
      "birth": null,
      "email": "cliente@example.com",
      "zipcode": "90000-000",
      "state": "RS",
      "city": "Porto Alegre",
      "district": "Centro",
      "street": "Rua A",
      "complement": null,
      "number": 100,
      "phone": "51999990000",
      "contactname": null,
      "whatsapp": "51999990000",
      "contactphone": null,
      "observations": null,
      "created_at": "2026-06-01T12:00:00.000000Z",
      "updated_at": "2026-06-01T12:00:00.000000Z"
    }
  ]
}
```

### Pre-Cadastro de Cliente

Endpoint:

```http
POST /api/clientes/pre-cadastro
```

Permissao necessaria: `customers` ou `orders`.

Campos aceitos:

| Campo | Obrigatorio | Tipo | Observacao |
|---|---:|---|---|
| `name` | Sim | string, max 255 | Nome do cliente |
| `cpfcnpj` | Nao | string, max 50 | CPF/CNPJ |
| `birth` | Nao | date | `YYYY-MM-DD` |
| `email` | Nao | email, max 50 | E-mail |
| `zipcode` | Nao | string, max 20 | CEP |
| `state` | Nao | string, max 20 | UF |
| `city` | Nao | string, max 50 | Cidade |
| `district` | Nao | string, max 50 | Bairro |
| `street` | Nao | string, max 80 | Rua |
| `complement` | Nao | string, max 80 | Complemento |
| `number` | Nao | integer | Numero |
| `phone` | Nao | string, max 20 | Telefone |
| `contactname` | Nao | string, max 50 | Contato |
| `whatsapp` | Nao | string, max 255 | WhatsApp |
| `contactphone` | Nao | string, max 20 | Telefone do contato |
| `observations` | Nao | string, max 500 | Observacoes |

Payload minimo:

```json
{
  "name": "Cliente App"
}
```

Payload completo:

```json
{
  "name": "Cliente App",
  "cpfcnpj": "12345678900",
  "birth": "1990-05-15",
  "email": "cliente@app.test",
  "zipcode": "90000-000",
  "state": "RS",
  "city": "Porto Alegre",
  "district": "Centro",
  "street": "Rua A",
  "complement": "Sala 1",
  "number": 100,
  "phone": "51999990000",
  "contactname": "Maria",
  "whatsapp": "51999990000",
  "contactphone": "51988887777",
  "observations": "Pre-cadastro feito pelo app"
}
```

Sucesso `201`:

```json
{
  "success": true,
  "message": "Pré-cadastro realizado com sucesso.",
  "result": {
    "name": "Cliente App",
    "cpfcnpj": "12345678900",
    "customer_number": 2,
    "tenant_id": 3,
    "updated_at": "2026-06-01T12:00:00.000000Z",
    "created_at": "2026-06-01T12:00:00.000000Z",
    "id": 16
  }
}
```

Erro de validacao `422`:

```json
{
  "message": "The name field is required.",
  "errors": {
    "name": ["The name field is required."]
  }
}
```

## Orcamentos por Equipamento, Modelo e Servico

No banco atual:

| Conceito no app | Origem no banco |
|---|---|
| Equipamento | `equipment.id` e `equipment.equipment` |
| Modelo | `budgets.model` |
| Servico | `budgets.service` |
| Orcamento | dados de `budgets` filtrados por `equipment_id`, `model` e `service` |

Este fluxo nao usa ordens de servico. Os selects do app devem ser preenchidos a partir de `equipment` e `budgets`.

### 1. Listar Equipamentos

Endpoint:

```http
GET /api/orcamentos/filtros
```

Sucesso `200`:

```json
{
  "success": true,
  "result": {
    "equipments": [
      {
        "id": 1,
        "equipment_number": 1,
        "equipment": "Notebook"
      }
    ],
  }
}
```

### 2. Listar Modelos do Equipamento

Endpoint:

```http
GET /api/orcamentos/modelos?equipment_id=1
```

Sucesso `200`:

```json
{
  "success": true,
  "result": {
    "equipment_id": 1,
    "models": ["Dell Inspiron", "Lenovo Ideapad"]
  }
}
```

### 3. Listar Servicos do Modelo

Endpoint:

```http
GET /api/orcamentos/servicos?equipment_id=1&model=Dell%20Inspiron
```

Sucesso `200`:

```json
{
  "success": true,
  "result": {
    "equipment_id": 1,
    "model": "Dell Inspiron",
    "services": ["Limpeza interna", "Troca de tela"]
  }
}
```

### 4. Consultar Orcamento

Endpoint:

```http
GET /api/orcamentos
```

Query params:

| Parametro | Obrigatorio | Tipo | Observacao |
|---|---:|---|---|
| `equipment_id` | Sim | integer | ID de `equipment` |
| `model` | Sim | string, max 255 | Valor exato de `budgets.model` |
| `service` | Sim | string, max 150 | Valor exato de `budgets.service` |

Exemplo:

```http
GET /api/orcamentos?equipment_id=1&model=Dell%20Inspiron&service=Troca%20de%20tela
```

Sucesso `200`:

```json
{
  "success": true,
  "status": true,
  "result": {
    "filters": {
      "equipment_id": 1,
      "model": "Dell Inspiron",
      "service": "Troca de tela"
    },
    "budgets": [
      {
        "id": 10,
        "tenant_id": 3,
        "budget_number": 5,
        "equipment_id": 1,
        "equipment": {
          "id": 1,
          "equipment_number": 1,
          "equipment": "Notebook"
        },
        "model": "Dell Inspiron",
        "service": "Troca de tela",
        "description": "Substituicao completa da tela",
        "estimated_time": "2 dias",
        "part_value": "250.00",
        "labor_value": "200.00",
        "total_value": "450.00",
        "warranty": "90 dias",
        "validity": 10,
        "obs": null,
        "created_at": "2026-06-01T12:00:00.000000Z",
        "updated_at": "2026-06-01T12:00:00.000000Z"
      }
    ]
  }
}
```

## Erros Padrao

Token ausente, invalido ou expirado `401`:

```json
{
  "message": "Unauthenticated."
}
```

Sem permissao `403`:

```json
{
  "message": "This action is unauthorized."
}
```

Registro nao encontrado ou de outro tenant `404`:

```json
{
  "message": "No query results for model..."
}
```

Erro de validacao `422`:

```json
{
  "message": "The given data was invalid.",
  "errors": {
    "field": ["Mensagem de erro"]
  }
}
```

Erro interno `500`:

```json
{
  "message": "Server Error"
}
```

No app, trate:

| Status | Acao sugerida |
|---:|---|
| `200`/`201` | Salvar retorno no cache do tenant atual |
| `401` | Deslogar e pedir novo login |
| `403` | Exibir bloqueio por permissao |
| `404` | Remover item local ou avisar que nao existe mais |
| `422` | Mostrar mensagens de `errors` nos campos |
| `500` | Exibir erro generico e permitir tentar novamente |

## Campos Principais das Tabelas

### `users`

Campos importantes para o app:

| Campo | Uso |
|---|---|
| `id` | Identificador do usuario |
| `tenant_id` | Chave principal para separar dados locais |
| `user_number` | Numero sequencial por tenant |
| `name` | Nome |
| `email` | Login |
| `roles` | Perfil |
| `status` | Status da conta |

Perfis atuais:

| Valor | Perfil |
|---:|---|
| `1` | Root system |
| `2` | Root app |
| `3` | Administrador |
| `4` | Operador |
| `5` | Tecnico |

### `customers`

Campos usados no pre-cadastro e listagem:

| Campo | Uso |
|---|---|
| `id` | Identificador |
| `tenant_id` | Tenant dono do cliente |
| `customer_number` | Numero sequencial por tenant |
| `name` | Nome do cliente |
| `cpfcnpj` | Documento |
| `birth` | Data de nascimento |
| `email` | E-mail |
| `zipcode`, `state`, `city`, `district`, `street`, `number`, `complement` | Endereco |
| `phone` | Telefone |
| `whatsapp` | WhatsApp |
| `contactname`, `contactphone` | Contato alternativo |
| `observations` | Observacoes |
| `created_at`, `updated_at` | Controle de sincronizacao |

### `equipment`

Campos usados nos filtros:

| Campo | Uso |
|---|---|
| `id` | ID para filtrar relatorio |
| `tenant_id` | Tenant dono do equipamento |
| `equipment_number` | Numero sequencial por tenant |
| `equipment` | Nome do equipamento, ex: Notebook |
| `chart` | Define uso em graficos internos |
| `created_at`, `updated_at` | Controle de sincronizacao |

### `orders`

Campos usados no relatorio:

| Campo | Uso |
|---|---|
| `id` | Identificador da OS |
| `tenant_id` | Tenant dono da OS |
| `customer_id` | Cliente |
| `equipment_id` | Equipamento |
| `user_id` | Tecnico/usuario vinculado |
| `order_number` | Numero sequencial por tenant |
| `tracking_token` | Token publico de acompanhamento |
| `model` | Marca/modelo digitado na OS |
| `defect` | Defeito relatado |
| `service_status` | Status numerico |
| `budget_value` | Valor de orcamento |
| `service_cost` | Valor final/custo da OS |
| `delivery_forecast` | Previsao de entrega |
| `delivery_date` | Data de entrega |
| `is_warranty_return` | Indica retorno em garantia |
| `created_at`, `updated_at` | Controle de sincronizacao |

## Roteiro de Gravacao por Tenant no App

1. No login, grave:
   - `access_token`
   - `user.id`
   - `user.tenant_id`
   - `user.roles`
   - `company.name`
   - `company.logo_url`
2. Crie uma area local por `tenant_id`.
3. Toda resposta `success: true` deve ser gravada dentro da area do tenant atual.
4. Para listas, grave tambem `updated_at` local da sincronizacao.
5. Para paginacao, grave:
   - `current_page`
   - `last_page`
   - `per_page`
   - `total`
6. Para relatorios, use uma chave composta pelos filtros:

```text
tenant:{tenant_id}:equipment-report:{equipment_id}:{model}:{status}:{from}:{to}:{page}
```

7. Ao receber `401`, limpe token e mantenha os dados locais apenas se o app precisar de modo offline.
8. Ao receber `403`, nao apague dados; apenas bloqueie a tela/acao.
9. Ao receber `404` para item especifico, remova ou marque como obsoleto no cache local.
10. Ao trocar de usuario, nao misture caches entre tenants.

## Paleta de Cores

Fonte de marca:

```text
Sora, Inter, system-ui
```

Tema claro:

| Token | Cor |
|---|---|
| `background` | `#f8fafc` |
| `foreground` | `#0b1220` |
| `primary` | `#0d47a1` |
| `primary-foreground` | `#ffffff` |
| `card` | `#ffffff` |
| `muted` | `#eef2f7` |
| `muted-foreground` | `#6b7280` |
| `accent` | `#e6f7ff` |
| `accent-foreground` | `#0d47a1` |
| `border/input` | `#dbe3ef` |
| `ring` | `#00b4ff` |

Tema escuro:

| Token | Cor |
|---|---|
| `background` | `#0b1220` |
| `primary` | `#00b4ff` |
| `primary-foreground` | `#0b1220` |
| `card/popover` | `#101a2d` |
| `muted` | `#18243a` |
| `muted-foreground` | `#a8b3c7` |
| `accent` | `#0d47a1` |
| `accent-foreground` | `#ffffff` |
| `ring` | `#00e59b` |

Cores de marca e site:

| Uso | Cor |
|---|---|
| Azul VetorOS | `#00B4FF` |
| Verde acao/CTA | `#00E59B` |
| Fundo escuro | `#0B1220` |
| Azul profundo | `#0D47A1` |
| Texto auxiliar ciano | `#7ee7ff` |
| Hover CTA | `#2ff0b1` |

Logo:

```text
public/images/vetor.png
```

Texto de marca:

```text
Vetor: #ffffff
OS: #00B4FF
```
