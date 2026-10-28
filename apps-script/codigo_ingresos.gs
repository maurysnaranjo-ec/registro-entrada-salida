/* ============================================================
   CONTROL DE INGRESO Y SALIDA · U.E. Cap. Edmundo Chiriboga
   Hoja de cálculo + Apps Script (Aplicación web)
   ------------------------------------------------------------
   1) CAMBIE las claves de USUARIOS antes de publicar.
   2) Implementar > Nueva implementación > Aplicación web
      Ejecutar como: Yo · Quién tiene acceso: Cualquier usuario
   3) Pegue la URL /exec en WEBAPP_URL del archivo HTML.
   Las hojas "Visitas" y "Funcionarios" se crean solas.
   Roles: operador (Inspección/portería) registra ingresos, salidas
   y retornos · admin además administra: historial, ediciones, lista de
   no autorizados, personal, operadores y año lectivo.
   El administrador crea más operadores desde la pestaña «Ajustes».
   ============================================================ */
var USUARIOS = {
  'admin':      {clave:'Chiriboga2026',  rol:'admin'},
  'inspeccion': {clave:'Inspeccion2026', rol:'operador'}
};
var TZ = 'America/Guayaquil';
var HOJA_O = 'Operadores', HOJA_PF = 'Personal', HOJA_C = 'Config';
var K_O = ['id','nombre','cedula','usuario','hash','salt','activo','creado'];
var T_O = ['ID','Nombre completo','Cédula','Usuario','Contraseña (cifrada)','Sal','Activo','Fecha de creación'];
var K_PF = ['id','nombre','cedula','cargo','activo'];
var T_PF = ['ID','Funcionario','Cédula','Cargo o área','Activo'];
var K_C = ['id','valor'];
var T_C = ['Clave','Valor'];

var TIPOS = ['Padre de familia o Representante','Persona externa'];

var HOJA_V = 'Visitas', HOJA_F = 'Funcionarios';
var K_V = ['id','fecha','tipo','nombre','tipoDoc','cedula','celular','entidad','dependencia','visita','asunto','retira','estudiante','curso','paralelo','entrada','salida','estado','motivoRetiro','autorizaRetiro','registradoPor','cerradoPor'];
var T_V = ['ID','Fecha','Tipo de persona','Nombre completo','Tipo de documento','Cédula / documento','Celular','Entidad o institución','Dependencia a la que se dirige','Persona a quien visita','Asunto o motivo','Retira estudiante','Estudiante','Curso','Paralelo','Hora de entrada','Hora de salida','Estado','Motivo del retiro','Retiro autorizado por','Registrado por','Salida registrada por'];
var HOJA_P = 'Personas', HOJA_N = 'NoAutorizados';
var K_P = ['id','tipoDoc','nombre','tipo','celular','entidad','visitas','ultima'];
var T_P = ['Cédula / documento','Tipo de documento','Nombre completo','Tipo de persona','Celular','Entidad','N.º de visitas','Última visita'];
var K_N = ['id','nombre','cedula','razon','fecha'];
var T_N = ['ID','Nombre completo','Cédula (opcional)','Razón por la que no puede ingresar','Fecha de registro'];
var K_F = ['id','fecha','nombre','cargo','cedula','motivo','detalle','salida','retornoPrevisto','autoriza','retorno','estado','obs','registradoPor','cerradoPor'];
var T_F = ['ID','Fecha','Funcionario','Cargo o área','Cédula','Motivo de salida','Detalle','Hora de salida','Hora prevista de retorno','Autorizado por','Hora de retorno','Estado','Observación','Registrado por','Retorno registrado por'];

function doGet(){ return json_({ok:true, mensaje:'Servicio de control de ingreso y salida activo.'}); }

function doPost(e){
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return json_(manejar_(JSON.parse(e.postData.contents))); }
  catch (err) { return json_({ok:false, error:String(err.message || err)}); }
  finally { lock.releaseLock(); }
}

function auth_(d){
  var u = String(d.usuario||'').trim();
  if (u && Object.prototype.hasOwnProperty.call(USUARIOS, u) && USUARIOS[u].clave === d.clave)
    return {rol:USUARIOS[u].rol, nombre:u};
  if (u){
    var o = leer_(HOJA_O,K_O,T_O).filter(function(r){ return r.usuario.toLowerCase() === u.toLowerCase() && r.activo === 'Sí'; })[0];
    if (o && hash_(d.clave, o.salt) === o.hash) return {rol:'operador', nombre:o.nombre};
  }
  throw new Error('Usuario o contraseña incorrectos.');
}
function hash_(clave, salt){
  var b = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + '|' + clave, Utilities.Charset.UTF_8);
  return b.map(function(x){ return ('0' + (x < 0 ? x + 256 : x).toString(16)).slice(-2); }).join('');
}
function cfg_(){
  var m = {}; leer_(HOJA_C,K_C,T_C).forEach(function(r){ m[r.id] = r.valor; });
  var h = hoy_(), y = parseInt(h.substr(0,4),10), mo = parseInt(h.substr(5,2),10), y0 = mo >= 9 ? y : y-1;
  return {etiqueta:m.etiqueta || (y0+' – '+(y0+1)), inicio:m.inicio || (y0+'-09-01'), fin:m.fin || ((y0+1)+'-06-30')};
}

function manejar_(d){
  var au = auth_(d), rol = au.rol, a = d.accion, hoy = hoy_();
  if (a === 'login') return {ok:true, rol:rol, nombre:au.nombre};

  if (a === 'listar'){
    return {ok:true, rol:rol, nombre:au.nombre, hoy:hoy, config:cfg_(),
      visitas: quitar_(leer_(HOJA_V,K_V,T_V).filter(function(r){ return r.fecha===hoy || r.estado==='Dentro'; })),
      funcionarios: quitar_(leer_(HOJA_F,K_F,T_F).filter(function(r){ return r.fecha===hoy || r.estado==='Fuera'; }))};
  }
  if (a === 'persona'){   // datos guardados de una persona ya registrada (por documento)
    dirAsegurar_();
    var pe = leer_(HOJA_P,K_P,T_P).filter(function(r){ return r.id === String(d.cedula||'').trim(); })[0];
    if (!pe) return {ok:true, persona:null};
    var rb0 = restringido_(pe.id, pe.nombre);
    return {ok:true, persona:{id:pe.id, tipoDoc:pe.tipoDoc, nombre:pe.nombre, celular:pe.celular, entidad:pe.entidad, tipo:pe.tipo, visitas:pe.visitas}, bloqueado:!!rb0, razon:rb0?rb0.razon:''};
  }
  if (a === 'buscarPersonas'){
    dirAsegurar_();
    var q = norm_(d.q), qt = q.split(' ').filter(Boolean), qd = String(d.q||'').replace(/\s/g,'');
    if (q.length < 2) return {ok:true, personas:[]};
    var res = leer_(HOJA_P,K_P,T_P).filter(function(r){
      var nn = norm_(r.nombre);
      return r.id.indexOf(qd) >= 0 || qt.every(function(t){ return nn.indexOf(t) >= 0; });
    }).sort(function(x,y){ return (parseInt(y.visitas,10)||0) - (parseInt(x.visitas,10)||0); }).slice(0,8);
    return {ok:true, personas:res.map(function(r){
      var rb = restringido_(r.id, r.nombre);
      return {id:r.id,tipoDoc:r.tipoDoc,nombre:r.nombre,tipo:r.tipo,celular:r.celular,entidad:r.entidad,visitas:r.visitas,bloqueado:!!rb,razon:rb?rb.razon:''};
    })};
  }
  if (a === 'verificar'){   // ¿está en la lista de personas no autorizadas?
    var rv = restringido_(String(d.cedula||'').trim(), d.nombre);
    return {ok:true, bloqueado:!!rv, razon:rv?rv.razon:'', nombre:rv?rv.nombre:''};
  }

  if (a === 'buscarFuncionarios'){
    var q2 = norm_(d.q), qt2 = q2.split(' ').filter(Boolean), qd2 = String(d.q||'').replace(/\s/g,'');
    if (q2.length < 2) return {ok:true, personal:[]};
    return {ok:true, personal:leer_(HOJA_PF,K_PF,T_PF).filter(function(r){
      if (r.activo !== 'Sí') return false;
      var nn = norm_(r.nombre);
      return (r.cedula && qd2 && r.cedula.indexOf(qd2) >= 0) || qt2.every(function(t){ return nn.indexOf(t) >= 0; });
    }).slice(0,8).map(function(r){ return {id:r.id, nombre:r.nombre, cedula:r.cedula, cargo:r.cargo}; })};
  }

  /* ---------- Visitantes ---------- */
  if (a === 'ingreso'){
    var ced = String(d.cedula||'').trim(), nom = String(d.nombre||'').trim();
    if (TIPOS.indexOf(d.tipo) < 0) throw new Error('Seleccione el tipo de persona.');
    if (!nom) throw new Error('Escriba el nombre completo.');
    if (d.tipoDoc === 'Cédula'){ if (!cedulaOk_(ced)) throw new Error('La cédula no es válida. Revise los 10 dígitos.'); }
    else if (!/^[A-Za-z0-9\-]{5,20}$/.test(ced)) throw new Error('Documento no válido.');
    // Lista de personas no autorizadas: se bloquea por documento o por nombre
    var rb = restringido_(ced, nom);
    if (rb) throw new Error('⛔ PERSONA NO AUTORIZADA: ' + rb.nombre + '. Razón: ' + rb.razon + '. No puede ingresar a la institución.');
    if (!String(d.dependencia||'').trim()) throw new Error('Indique la dependencia a la que se dirige.');
    if (!String(d.asunto||'').trim()) throw new Error('Escriba el asunto o motivo.');
    if (d.tipo === 'Persona externa' && !String(d.entidad||'').trim()) throw new Error('Escriba la entidad o institución que representa.');
    var retira = d.retira === 'Sí' ? 'Sí' : 'No', est = [];
    if (retira === 'Sí'){
      est = (d.estudiantes && d.estudiantes.length) ? d.estudiantes.slice(0,6) : [{nombre:d.estudiante, curso:d.curso, paralelo:d.paralelo}];
      est.forEach(function(x){ if (!(String(x.nombre||'').trim() && x.curso && x.paralelo)) throw new Error('Complete nombre, curso y paralelo de cada estudiante.'); });
      if (!String(d.motivoRetiro||'').trim()) throw new Error('Indique el motivo del retiro.');
    }
    dirAsegurar_();   // (la primera vez migra el directorio desde Visitas, antes de guardar esta visita)
    var dentro = leer_(HOJA_V,K_V,T_V).some(function(r){ return r.estado==='Dentro' && r.cedula===ced; });
    if (dentro) throw new Error('Esta persona ya está registrada dentro de la institución. Registre primero su salida.');
    var T = function(v){ return String(v||'').trim(); };
    var unir = function(k){ return est.map(function(x){ return T(x[k]); }).join(' | '); };
    var tdoc = d.tipoDoc==='Cédula' ? 'Cédula' : 'Pasaporte u otro';
    agregar_(HOJA_V,K_V,T_V,{id:id_(), fecha:hoy, tipo:d.tipo, nombre:nom, tipoDoc:tdoc, cedula:ced,
      celular:T(d.celular), entidad:d.tipo==='Persona externa'?T(d.entidad):'', dependencia:T(d.dependencia), visita:T(d.visita), asunto:T(d.asunto),
      retira:retira, estudiante:unir('nombre'), curso:unir('curso'), paralelo:unir('paralelo'),
      entrada:ahora_(), salida:'', estado:'Dentro', registradoPor:au.nombre,
      motivoRetiro:retira==='Sí'?T(d.motivoRetiro):'', autorizaRetiro:retira==='Sí'?T(d.autorizaRetiro):''});
    upsertPersona_({id:ced, tipoDoc:tdoc, nombre:nom, tipo:d.tipo, celular:T(d.celular), entidad:d.tipo==='Persona externa'?T(d.entidad):'', ultima:hoy});
    return {ok:true};
  }
  if (a === 'salidaVisita'){
    var v = buscar_(HOJA_V,K_V,T_V,d.id);
    if (v.reg.estado !== 'Dentro') throw new Error('Esta persona ya tiene registrada su salida.');
    v.reg.salida = ahora_(); v.reg.estado = 'Salió'; v.reg.cerradoPor = au.nombre;
    guardar_(HOJA_V,K_V,T_V,v); return {ok:true};
  }

  /* ---------- Funcionarios ---------- */
  if (a === 'salidaFuncionario'){
    var fn = String(d.nombre||'').trim();
    if (!fn) throw new Error('Escriba el nombre del funcionario.');
    if (!String(d.motivo||'').trim()) throw new Error('Seleccione el motivo de la salida.');
    if (d.motivo === 'Otro' && !String(d.detalle||'').trim()) throw new Error('Describa el motivo de la salida.');
    var retorna = d.retorna === 'No' ? 'No' : 'Sí';
    if (retorna === 'No' && !String(d.obs||'').trim()) throw new Error('Indique por qué no retorna (ej. reposo médico).');
    var fuera = leer_(HOJA_F,K_F,T_F).some(function(r){ return r.estado==='Fuera' && r.nombre.toLowerCase()===fn.toLowerCase(); });
    if (fuera) throw new Error('Este funcionario ya consta como fuera de la institución. Registre su retorno.');
    var T2 = function(v){ return String(v||'').trim(); };
    agregar_(HOJA_F,K_F,T_F,{id:id_(), fecha:hoy, nombre:fn, cargo:T2(d.cargo), cedula:T2(d.cedula), motivo:d.motivo, detalle:T2(d.detalle),
      salida:ahora_(), retornoPrevisto:retorna==='Sí'?T2(d.retornoPrevisto):'', autoriza:T2(d.autoriza), retorno:'',
      estado:retorna==='Sí'?'Fuera':'No retorna', obs:retorna==='No'?T2(d.obs):'', registradoPor:au.nombre});
    registrarPersonal_(fn, T2(d.cedula), T2(d.cargo));   // el funcionario queda guardado para futuras salidas
    return {ok:true};
  }
  if (a === 'retornoFuncionario'){
    var f = buscar_(HOJA_F,K_F,T_F,d.id);
    if (f.reg.estado !== 'Fuera') throw new Error('Este funcionario no consta como fuera.');
    f.reg.retorno = ahora_(); f.reg.estado = 'Retornó'; f.reg.cerradoPor = au.nombre;
    guardar_(HOJA_F,K_F,T_F,f); return {ok:true};
  }
  if (a === 'noRetorna'){
    var g = buscar_(HOJA_F,K_F,T_F,d.id);
    if (g.reg.estado !== 'Fuera') throw new Error('Este funcionario no consta como fuera.');
    if (!String(d.obs||'').trim()) throw new Error('Indique el motivo por el que no retorna.');
    g.reg.estado = 'No retorna'; g.reg.obs = String(d.obs).trim(); g.reg.cerradoPor = au.nombre;
    guardar_(HOJA_F,K_F,T_F,g); return {ok:true};
  }

  /* ---------- Solo administrador ---------- */
  if (rol !== 'admin') throw new Error('Solo el administrador puede realizar esta acción.');
  if (a === 'historial'){
    var esV = d.modulo !== 'funcionarios', q = String(d.q||'').toLowerCase().trim();
    var lista = esV ? leer_(HOJA_V,K_V,T_V) : leer_(HOJA_F,K_F,T_F);
    lista = lista.filter(function(r){
      if (d.desde && r.fecha < d.desde) return false;
      if (d.hasta && r.fecha > d.hasta) return false;
      return !q || (r.nombre+' '+r.cedula).toLowerCase().indexOf(q) >= 0;
    });
    return {ok:true, registros:quitar_(lista)};
  }
  if (a === 'configGuardar'){
    var et = String(d.etiqueta||'').trim(), ini = String(d.inicio||''), fin = String(d.fin||'');
    if (!et) throw new Error('Escriba el nombre del año lectivo (ej. 2026 – 2027).');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ini) || !/^\d{4}-\d{2}-\d{2}$/.test(fin)) throw new Error('Indique las fechas de inicio y fin.');
    if (ini >= fin) throw new Error('La fecha de inicio debe ser anterior a la de fin.');
    [['etiqueta',et],['inicio',ini],['fin',fin]].forEach(function(p){
      var ex = leer_(HOJA_C,K_C,T_C).filter(function(r){ return r.id === p[0]; })[0];
      if (ex){ ex.valor = p[1]; guardar_(HOJA_C,K_C,T_C,{_fila:ex._fila, reg:ex}); } else agregar_(HOJA_C,K_C,T_C,{id:p[0], valor:p[1]});
    });
    return {ok:true, config:cfg_()};
  }

  /* --- Operadores --- */
  if (a === 'opListar') return {ok:true, lista:leer_(HOJA_O,K_O,T_O).map(function(r){ return {id:r.id,nombre:r.nombre,cedula:r.cedula,usuario:r.usuario,activo:r.activo,creado:r.creado}; })};
  if (a === 'opGuardar'){
    var on = String(d.nombre||'').trim(), oc = String(d.cedula||'').trim(), ou = String(d.opUsuario||'').trim(), ok_ = String(d.opClave||'');   // (usuario/clave son las credenciales de quien envía)
    if (!on) throw new Error('Escriba el nombre completo.');
    if (!cedulaOk_(oc)) throw new Error('La cédula del operador no es válida.');
    if (!/^[A-Za-z0-9._-]{3,20}$/.test(ou)) throw new Error('Usuario: 3 a 20 letras, números, punto, guion o guion bajo (sin espacios).');
    var reservado = Object.keys(USUARIOS).some(function(k){ return k.toLowerCase() === ou.toLowerCase(); });
    var ops = leer_(HOJA_O,K_O,T_O);
    if (reservado || ops.some(function(r){ return r.usuario.toLowerCase() === ou.toLowerCase() && r.id !== d.id; })) throw new Error('Ese usuario ya existe. Elija otro.');
    if (d.id){
      var xo = buscar_(HOJA_O,K_O,T_O,d.id);
      xo.reg.nombre = on; xo.reg.cedula = oc; xo.reg.usuario = ou; xo.reg.activo = d.activo === 'No' ? 'No' : 'Sí';
      if (ok_){ if (ok_.length < 6) throw new Error('La contraseña debe tener al menos 6 caracteres.'); xo.reg.salt = id_()+id_(); xo.reg.hash = hash_(ok_, xo.reg.salt); }
      guardar_(HOJA_O,K_O,T_O,xo);
    } else {
      if (ok_.length < 6) throw new Error('La contraseña debe tener al menos 6 caracteres.');
      var sal = id_()+id_();
      agregar_(HOJA_O,K_O,T_O,{id:id_(), nombre:on, cedula:oc, usuario:ou, hash:hash_(ok_,sal), salt:sal, activo:'Sí', creado:hoy});
    }
    return {ok:true};
  }
  if (a === 'opEliminar'){ var xe = buscar_(HOJA_O,K_O,T_O,d.id); hoja_(HOJA_O,T_O).deleteRow(xe._fila); return {ok:true}; }

  /* --- Personal (directorio de funcionarios) --- */
  if (a === 'personalListar') return {ok:true, lista:quitar_(leer_(HOJA_PF,K_PF,T_PF))};
  if (a === 'personalGuardar'){
    var pn = String(d.nombre||'').trim(), pc = String(d.cedula||'').trim(), pg = String(d.cargo||'').trim();
    if (!pn) throw new Error('Escriba el nombre del funcionario.');
    if (pc && !cedulaOk_(pc)) throw new Error('La cédula no es válida.');
    var lp = leer_(HOJA_PF,K_PF,T_PF);
    if (pc && lp.some(function(r){ return r.cedula === pc && r.id !== d.id; })) throw new Error('Ya existe un funcionario con esa cédula.');
    if (d.id){ var xp = buscar_(HOJA_PF,K_PF,T_PF,d.id); xp.reg.nombre = pn; xp.reg.cedula = pc; xp.reg.cargo = pg; xp.reg.activo = d.activo === 'No' ? 'No' : 'Sí'; guardar_(HOJA_PF,K_PF,T_PF,xp); }
    else agregar_(HOJA_PF,K_PF,T_PF,{id:id_(), nombre:pn, cedula:pc, cargo:pg, activo:'Sí'});
    return {ok:true};
  }
  if (a === 'personalEliminar'){ var xq = buscar_(HOJA_PF,K_PF,T_PF,d.id); hoja_(HOJA_PF,T_PF).deleteRow(xq._fila); return {ok:true}; }
  if (a === 'personalImportar'){
    var filas = d.filas || [], ex2 = leer_(HOJA_PF,K_PF,T_PF), porCed = {}, porNom = {}, nuevos = [], act = 0, igual = 0, omit = 0;
    ex2.forEach(function(r){ if (r.cedula) porCed[r.cedula] = r; porNom[clave_(r.nombre)] = r; });
    filas.forEach(function(f){
      var nm = String(f.nombre||'').trim(), cd = String(f.cedula||'').replace(/\s/g,''), cg = String(f.cargo||'').trim();
      if (/^\d{9}$/.test(cd)) cd = '0' + cd;      // Excel suele quitar el cero inicial
      if (!nm){ omit++; return; }
      var r = (cd && porCed[cd]) || porNom[clave_(nm)];
      if (r){
        var cambio = false;
        if (cd && !r.cedula){ r.cedula = cd; cambio = true; }
        if (cg && r.cargo !== cg){ r.cargo = cg; cambio = true; }
        if (cambio){ if (r._fila) guardar_(HOJA_PF,K_PF,T_PF,{_fila:r._fila, reg:r}); act++; } else igual++;
        return;
      }
      var o = {id:id_(), nombre:nm, cedula:cd, cargo:cg, activo:'Sí'};
      nuevos.push(o); if (cd) porCed[cd] = o; porNom[clave_(nm)] = o;
    });
    bulkAppend_(HOJA_PF,K_PF,T_PF,nuevos);
    return {ok:true, agregados:nuevos.length, actualizados:act, existentes:igual, omitidos:omit};
  }

  if (a === 'noAutListar') return {ok:true, lista:quitar_(leer_(HOJA_N,K_N,T_N))};
  if (a === 'noAutGuardar'){
    var nn = String(d.nombre||'').trim(), cc = String(d.cedula||'').trim(), rz = String(d.razon||'').trim();
    if (!nn) throw new Error('Escriba el nombre completo.');
    if (!rz) throw new Error('Escriba la razón por la que no puede ingresar.');
    if (cc && !/^[A-Za-z0-9\-]{5,20}$/.test(cc)) throw new Error('Documento no válido.');
    if (d.id){ var x1 = buscar_(HOJA_N,K_N,T_N,d.id); x1.reg.nombre = nn; x1.reg.cedula = cc; x1.reg.razon = rz; guardar_(HOJA_N,K_N,T_N,x1); }
    else agregar_(HOJA_N,K_N,T_N,{id:id_(), nombre:nn, cedula:cc, razon:rz, fecha:hoy});
    return {ok:true};
  }
  if (a === 'noAutEliminar'){ var x2 = buscar_(HOJA_N,K_N,T_N,d.id); hoja_(HOJA_N,T_N).deleteRow(x2._fila); return {ok:true}; }
  if (a === 'editar'){
    var eV = d.modulo !== 'funcionarios';
    var campos = eV ? ['fecha','tipo','nombre','tipoDoc','cedula','celular','entidad','dependencia','visita','asunto','retira','estudiante','curso','paralelo','entrada','salida','estado','motivoRetiro','autorizaRetiro']
                    : ['fecha','nombre','cargo','cedula','motivo','detalle','salida','retornoPrevisto','autoriza','retorno','estado','obs'];
    var e = eV ? buscar_(HOJA_V,K_V,T_V,d.id) : buscar_(HOJA_F,K_F,T_F,d.id);
    var n = {}; campos.forEach(function(k){ n[k] = (d[k] === undefined ? e.reg[k] : String(d[k]).trim()); });
    var hora = /^([01]\d|2[0-3]):[0-5]\d$/;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(n.fecha)) throw new Error('Fecha no válida.');
    if (!n.nombre) throw new Error('El nombre es obligatorio.');
    if (eV){
      if (TIPOS.indexOf(n.tipo) < 0) throw new Error('Tipo de persona no válido.');
      if (!n.cedula) throw new Error('El documento es obligatorio.');
      if (!hora.test(n.entrada)) throw new Error('Hora de entrada no válida (HH:MM).');
      if (n.salida && !hora.test(n.salida)) throw new Error('Hora de salida no válida (HH:MM).');
      if (['Dentro','Salió'].indexOf(n.estado) < 0) throw new Error('Estado no válido.');
      if (n.estado === 'Salió' && !n.salida) throw new Error('Indique la hora de salida.');
      if (n.estado === 'Dentro') n.salida = '';
      n.retira = n.retira === 'Sí' ? 'Sí' : 'No';
      if (n.retira === 'No'){ n.estudiante = ''; n.curso = ''; n.paralelo = ''; n.motivoRetiro = ''; n.autorizaRetiro = ''; }
      if (n.tipo !== 'Persona externa') n.entidad = '';
    } else {
      if (!n.motivo) throw new Error('El motivo es obligatorio.');
      if (!hora.test(n.salida)) throw new Error('Hora de salida no válida (HH:MM).');
      if (n.retornoPrevisto && !hora.test(n.retornoPrevisto)) throw new Error('Hora prevista no válida (HH:MM).');
      if (n.retorno && !hora.test(n.retorno)) throw new Error('Hora de retorno no válida (HH:MM).');
      if (['Fuera','Retornó','No retorna'].indexOf(n.estado) < 0) throw new Error('Estado no válido.');
      if (n.estado === 'Retornó' && !n.retorno) throw new Error('Indique la hora de retorno.');
      if (n.estado !== 'Retornó') n.retorno = '';
      if (n.estado === 'No retorna' && !n.obs) throw new Error('Indique por qué no retorna.');
    }
    campos.forEach(function(k){ e.reg[k] = n[k]; });
    if (eV) guardar_(HOJA_V,K_V,T_V,e); else guardar_(HOJA_F,K_F,T_F,e);
    return {ok:true};
  }
  if (a === 'eliminar'){
    var esVis = d.modulo !== 'funcionarios';
    var x = esVis ? buscar_(HOJA_V,K_V,T_V,d.id) : buscar_(HOJA_F,K_F,T_F,d.id);
    hoja_(esVis?HOJA_V:HOJA_F, esVis?T_V:T_F).deleteRow(x._fila); return {ok:true};
  }
  throw new Error('Acción desconocida.');
}

/* ---------- Utilidades ---------- */
function cedulaOk_(c){
  if (!/^\d{10}$/.test(c)) return false;
  var prov = parseInt(c.substr(0,2),10);
  if (!((prov >= 1 && prov <= 24) || prov === 30)) return false;
  if (parseInt(c.charAt(2),10) > 5) return false;
  var s = 0;
  for (var i=0;i<9;i++){ var n = parseInt(c.charAt(i),10) * (i%2===0 ? 2 : 1); if (n > 9) n -= 9; s += n; }
  return ((10 - s%10) % 10) === parseInt(c.charAt(9),10);
}
function norm_(s){ return String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9ñ ]/g,' ').replace(/\s+/g,' ').trim(); }
function clave_(s){ return norm_(s).split(' ').filter(Boolean).sort().join(' '); }
// Coincide por documento, o por nombre completo (mismas palabras, en cualquier orden; mínimo 2 palabras)
function restringido_(cedula, nombre){
  var lista = leer_(HOJA_N,K_N,T_N), ck = clave_(nombre), nt = ck ? ck.split(' ').length : 0;
  for (var i=0;i<lista.length;i++){
    var r = lista[i];
    if (r.cedula && cedula && r.cedula === cedula) return r;
    var rk = clave_(r.nombre);
    if (rk && nt >= 2 && rk.split(' ').length >= 2 && rk === ck) return r;
  }
  return null;
}
// Directorio de personas: se llena solo con cada ingreso; la primera vez se migra desde "Visitas"
function dirAsegurar_(){
  var h = hoja_(HOJA_P,T_P);
  if (h.getLastRow() > 1) return;
  var mapa = {};
  leer_(HOJA_V,K_V,T_V).forEach(function(r){
    var p = mapa[r.cedula] || {id:r.cedula, visitas:0};
    p.tipoDoc = r.tipoDoc; p.nombre = r.nombre; p.tipo = r.tipo; p.celular = r.celular || p.celular || '';
    p.entidad = r.entidad; p.visitas++; p.ultima = r.fecha; mapa[r.cedula] = p;
  });
  Object.keys(mapa).forEach(function(k){ agregar_(HOJA_P,K_P,T_P,mapa[k]); });
}
function upsertPersona_(p){
  var ex = leer_(HOJA_P,K_P,T_P).filter(function(r){ return r.id === p.id; })[0];
  if (!ex){ p.visitas = 1; agregar_(HOJA_P,K_P,T_P,p); return; }
  var e = {_fila:ex._fila, reg:ex};
  e.reg.tipoDoc = p.tipoDoc; e.reg.nombre = p.nombre; e.reg.tipo = p.tipo; e.reg.entidad = p.entidad;
  if (p.celular) e.reg.celular = p.celular;
  e.reg.visitas = String((parseInt(ex.visitas,10)||0) + 1); e.reg.ultima = p.ultima;
  guardar_(HOJA_P,K_P,T_P,e);
}
function registrarPersonal_(nom, ced, cargo){
  var ck = clave_(nom);
  var r = leer_(HOJA_PF,K_PF,T_PF).filter(function(x){ return (ced && x.cedula === ced) || clave_(x.nombre) === ck; })[0];
  if (!r){ agregar_(HOJA_PF,K_PF,T_PF,{id:id_(), nombre:nom, cedula:ced, cargo:cargo, activo:'Sí'}); return; }
  var ch = false;
  if (ced && !r.cedula){ r.cedula = ced; ch = true; }
  if (cargo && r.cargo !== cargo){ r.cargo = cargo; ch = true; }
  if (ch) guardar_(HOJA_PF,K_PF,T_PF,{_fila:r._fila, reg:r});
}
function bulkAppend_(nombre, claves, titulos, lista){
  if (!lista.length) return;
  var h = hoja_(nombre,titulos), f = h.getLastRow() + 1, fin = f + lista.length - 1;
  if (h.getMaxRows() < fin) h.insertRowsAfter(h.getMaxRows(), fin - h.getMaxRows());
  var vals = lista.map(function(o){ return claves.map(function(k){ return o[k] === undefined ? '' : o[k]; }); });
  h.getRange(f,1,vals.length,claves.length).setNumberFormat('@').setValues(vals);
}
function id_(){ return Utilities.getUuid().substring(0,8); }
function hoy_(){ return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'); }
function ahora_(){ return Utilities.formatDate(new Date(), TZ, 'HH:mm'); }
function quitar_(l){ return l.map(function(o){ delete o._fila; return o; }); }

function hoja_(nombre, titulos){
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var h = ss.getSheetByName(nombre);
  if (!h){
    h = ss.insertSheet(nombre);
    h.appendRow(titulos);
    h.getRange(1,1,h.getMaxRows(),titulos.length).setNumberFormat('@'); // todo como texto (conserva ceros y horas)
    h.setFrozenRows(1);
  } else {
    if (h.getMaxColumns() < titulos.length) h.insertColumnsAfter(h.getMaxColumns(), titulos.length - h.getMaxColumns());
    var enc = h.getRange(1,1,1,titulos.length).getValues()[0];
    for (var c=0;c<titulos.length;c++){
      if (enc[c] === ''){ h.getRange(1,c+1,h.getMaxRows(),1).setNumberFormat('@'); h.getRange(1,c+1).setValue(titulos[c]); }
    }
  }
  return h;
}
function leer_(nombre, claves, titulos){
  var v = hoja_(nombre,titulos).getDataRange().getDisplayValues(), out = [];
  for (var i=1;i<v.length;i++){
    var o = {_fila:i+1};
    for (var j=0;j<claves.length;j++) o[claves[j]] = (v[i][j] === undefined ? '' : v[i][j]);
    if (o.id) out.push(o);
  }
  return out;
}
function buscar_(nombre, claves, titulos, id){
  var l = leer_(nombre,claves,titulos);
  for (var i=0;i<l.length;i++) if (l[i].id === id) return {_fila:l[i]._fila, reg:l[i]};
  throw new Error('Registro no encontrado.');
}
function agregar_(nombre, claves, titulos, o){
  var h = hoja_(nombre,titulos), f = h.getLastRow()+1;
  h.getRange(f,1,1,claves.length).setNumberFormat('@').setValues([claves.map(function(k){ return o[k]===undefined?'':o[k]; })]);
}
function guardar_(nombre, claves, titulos, r){
  hoja_(nombre,titulos).getRange(r._fila,1,1,claves.length).setNumberFormat('@')
    .setValues([claves.map(function(k){ return r.reg[k]===undefined?'':r.reg[k]; })]);
}
function json_(o){ return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
