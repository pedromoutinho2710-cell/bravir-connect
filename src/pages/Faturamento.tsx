// NOTA: Como o conteúdo completo de Faturamento.tsx não foi fornecido no contexto,
// abaixo está um patch cirúrgico documentado. Na prática, o arquivo completo deve
// ser editado aplicando exatamente as duas mudanças descritas nos comentários.
//
// MUDANÇA 1 – No select da query itens_pedido para idsSaldo, adicionar desconto_perfil:
//
//   ANTES:
//     const { data: itensSaldo } = await supabase
//       .from('itens_pedido')
//       .select('produto_id, quantidade, preco_unitario, desconto, desconto_comercial, unidade')
//       .in('id', idsSaldo);
//
//   DEPOIS:
//     const { data: itensSaldo } = await supabase
//       .from('itens_pedido')
//       .select('produto_id, quantidade, preco_unitario, desconto, desconto_comercial, desconto_perfil, unidade')
//       .in('id', idsSaldo);
//
// MUDANÇA 2 – No objeto novosItensPayload, incluir desconto_perfil:
//
//   ANTES:
//     const novosItensPayload = itensSaldo.map((item) => ({
//       pedido_id: pedidoFilhoId,
//       produto_id: item.produto_id,
//       quantidade: item.quantidade,
//       preco_unitario: item.preco_unitario,
//       desconto: item.desconto,
//       desconto_comercial: item.desconto_comercial,
//       unidade: item.unidade,
//     }));
//
//   DEPOIS:
//     const novosItensPayload = itensSaldo.map((item) => ({
//       pedido_id: pedidoFilhoId,
//       produto_id: item.produto_id,
//       quantidade: item.quantidade,
//       preco_unitario: item.preco_unitario,
//       desconto: item.desconto,
//       desconto_comercial: item.desconto_comercial,
//       desconto_perfil: item.desconto_perfil,
//       unidade: item.unidade,
//     }));
//
// Como o conteúdo real do arquivo não foi disponibilizado, não é possível reproduzir
// o arquivo inteiro sem risco de apagar código existente. Solicite o conteúdo atual
// de src/pages/Faturamento.tsx para que a edição completa seja gerada com segurança.
