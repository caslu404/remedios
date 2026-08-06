# Decisões médicas pendentes

Nenhuma resposta abaixo deve ser escolhida por programação. Até haver fonte, data e pessoa responsável pela validação, o motor permanece conservador.

| Decisão | Estado no MVP | Comportamento conservador |
|---|---|---|
| Mínimo/máximo do metronidazol | Não confirmado | Mostra o intervalo-alvo de 8 h; não encurta nem alonga automaticamente. |
| Âncora diária do metronidazol | Preferência organizacional informada pelo usuário | Usa o despertar como primeiro alvo e repete o alvo cadastrado de 8 h; isso não valida mínimo, máximo ou reagendamento por atraso. |
| Mínimo/máximo da rifaximina | Não confirmado | Mostra o alvo de 12 h; não move doses por atraso. |
| Atraso move doses futuras | Não confirmado | Registra `taken_at`, preserva os próximos horários e abre conflito. |
| Limite máximo de atraso | Não confirmado | Não classifica como dose perdida automaticamente. |
| Momento de marcar “perdida” | Não confirmado | Somente ação explícita/ revisão humana. |
| Acordar o usuário | Não confirmado | Apenas alerta conflito com sono; nunca agenda essa decisão sozinho. |
| Nexium + NAC sempre juntos | Não confirmado | Exibe o mesmo alvo inicial do PRD e um aviso de agrupamento não validado. |
| Óleo de orégano + NAC sempre juntos | Permitido apenas quando as regras coincidirem | Agrupa durante a fase ativa do NAC; depois deixa o horário do óleo sem inferência. |
| Berberina vinculada a refeição | Não confirmado | Usa blocos de manhã/noite como preferência organizacional, sem afirmar regra alimentar. |
| Sono versus intervalo | Não confirmado | Mantém o alvo e mostra conflito; não cancela, duplica ou aproxima doses. |

## Como validar uma regra

O painel/API exige:

- alvo, mínimo e máximo independentes;
- fonte;
- data/hora da confirmação;
- pessoa que confirmou;
- observação opcional.

Uma política de reagendamento exige confirmação separada. Preencher tolerâncias não habilita automaticamente a movimentação de doses futuras.
