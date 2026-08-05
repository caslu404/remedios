# Estratégia de testes

O motor foi testado antes de ser importado pela interface.

## Cobertura atual essencial

- Despertares: 05:30, 06:00, 06:30, 07:00, 07:45, 09:00 e 11:00.
- Datas: término de antibióticos, transição das fases da berberina, último dia do óleo e dia após o tratamento de 60 dias.
- Frequências e duplicidade.
- Dependência NAC → rifaximina e Nexium → café.
- Limites apenas quando fornecidos.
- Óleo de orégano sem antecedência inferida fora da fase do NAC.
- Dose tardia sem movimentação automática.
- Reagendamento somente com política confirmada.
- Clique duplicado idempotente.

## Antes de produção

1. Aplicar migration em um projeto Supabase temporário e rodar testes de RLS com dois usuários.
2. Exercitar a fila offline em dois dispositivos.
3. Testar endpoint expirado, push negado e falha de entrega.
4. Validar instalação e ações de notificação em iPhone real (iOS 16.4+).
5. Testar a precisão do worker no plano escolhido da Vercel.
6. Executar teste de restauração de backup/exportação.
