-- =====================================================================
--  Preventis — esquema completo de la base (PostgreSQL)
--  Generado con: pg_dump -s --no-owner --no-privileges (infratec, 2026-09-17)
--  Idéntico al esquema de producción IES a esa fecha.
--  Lo aplica deploy/install.sh solo si la base está vacía. Las migraciones
--  de backend/src/extras.js siguen corriendo al arrancar la API.
--  Para regenerarlo tras cambios de esquema, repetir el pg_dump anterior.
-- =====================================================================
--
-- PostgreSQL database dump
--


-- Dumped from database version 17.10 (Debian 17.10-0+deb13u1)
-- Dumped by pg_dump version 17.10 (Debian 17.10-0+deb13u1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: frecuencia_visita; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.frecuencia_visita AS ENUM (
    'mensual',
    'bimestral',
    'trimestral',
    'semestral',
    'anual',
    'sin'
);


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: app_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_config (
    clave text NOT NULL,
    valor jsonb DEFAULT '{}'::jsonb
);


--
-- Name: auditoria; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.auditoria (
    id integer NOT NULL,
    ts timestamp with time zone DEFAULT now(),
    usuario text,
    rol text,
    metodo text,
    ruta text,
    status integer,
    detalle text
);


--
-- Name: auditoria_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.auditoria_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: auditoria_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.auditoria_id_seq OWNED BY public.auditoria.id;


--
-- Name: chatbot_numeros; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chatbot_numeros (
    id integer NOT NULL,
    telefono text,
    nombre text,
    rol text DEFAULT 'tecnico'::text NOT NULL,
    tecnico_id integer,
    usuario_id integer,
    cliente_id integer,
    autorizado boolean DEFAULT false NOT NULL,
    ultimo_msg text,
    ultimo_at timestamp with time zone,
    msgs integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: chatbot_numeros_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.chatbot_numeros_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: chatbot_numeros_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.chatbot_numeros_id_seq OWNED BY public.chatbot_numeros.id;


--
-- Name: cliente_archivos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cliente_archivos (
    id integer NOT NULL,
    cliente_id integer,
    tipo text DEFAULT 'doc'::text,
    filename text,
    path text,
    descripcion text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: cliente_archivos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cliente_archivos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cliente_archivos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cliente_archivos_id_seq OWNED BY public.cliente_archivos.id;


--
-- Name: cliente_contactos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cliente_contactos (
    id integer NOT NULL,
    cliente_id integer,
    nombre text,
    email text,
    telefono text,
    cargo text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: cliente_contactos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cliente_contactos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cliente_contactos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cliente_contactos_id_seq OWNED BY public.cliente_contactos.id;


--
-- Name: cliente_credenciales; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cliente_credenciales (
    id integer NOT NULL,
    cliente_id integer,
    nombre text,
    usuario text,
    password_enc text,
    url text,
    notas text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: cliente_credenciales_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cliente_credenciales_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cliente_credenciales_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cliente_credenciales_id_seq OWNED BY public.cliente_credenciales.id;


--
-- Name: clientes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clientes (
    id integer NOT NULL,
    nombre text NOT NULL,
    direccion text,
    telefono text,
    frecuencia public.frecuencia_visita DEFAULT 'mensual'::public.frecuencia_visita NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    lat double precision,
    lon double precision,
    notas text,
    vip boolean DEFAULT false,
    contrato_inicio date,
    contrato_fin date,
    contrato_monto text,
    contrato_notas text,
    avatar_path text,
    rut text,
    empresa_monitoreo text,
    nro_abonado text
);


--
-- Name: clientes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clientes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clientes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clientes_id_seq OWNED BY public.clientes.id;


--
-- Name: contratos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contratos (
    id integer NOT NULL,
    cliente_id integer NOT NULL,
    titulo text NOT NULL,
    descripcion text,
    fecha_inicio date,
    fecha_fin date,
    deberes text,
    responsabilidades text,
    monto numeric(14,2),
    moneda text DEFAULT 'UYU'::text,
    forma_pago text,
    estado text DEFAULT 'activo'::text NOT NULL,
    creado timestamp with time zone DEFAULT now() NOT NULL,
    frecuencia_preventivo text,
    recurrencia_preventivo text,
    correctivos_anuales integer
);


--
-- Name: contratos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.contratos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: contratos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.contratos_id_seq OWNED BY public.contratos.id;


--
-- Name: equipos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.equipos (
    id integer NOT NULL,
    cliente_id integer NOT NULL,
    sistema_id integer,
    direccion text,
    grupo text,
    subgrupo text,
    etiqueta text,
    tipo_elemento_id integer,
    modelo text,
    codigo_qr text,
    activo boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    foto_path text,
    cred_usuario text,
    cred_password_enc text,
    cred_url text,
    cred_notas text,
    ip_host text
);


--
-- Name: equipos_estandar; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.equipos_estandar (
    id integer NOT NULL,
    nombre text,
    tipo text,
    marca text,
    modelo text,
    foto_path text,
    created_at timestamp with time zone DEFAULT now(),
    sistema_id integer
);


--
-- Name: equipos_estandar_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.equipos_estandar_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: equipos_estandar_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.equipos_estandar_id_seq OWNED BY public.equipos_estandar.id;


--
-- Name: equipos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.equipos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: equipos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.equipos_id_seq OWNED BY public.equipos.id;


--
-- Name: estados_equipo; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.estados_equipo (
    id integer NOT NULL,
    nombre text NOT NULL,
    es_falla boolean DEFAULT false NOT NULL,
    orden integer DEFAULT 0 NOT NULL,
    icono text
);


--
-- Name: estados_equipo_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.estados_equipo_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: estados_equipo_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.estados_equipo_id_seq OWNED BY public.estados_equipo.id;


--
-- Name: fin_cobros; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fin_cobros (
    id integer NOT NULL,
    cliente_id integer,
    factura_id integer,
    fecha date DEFAULT CURRENT_DATE,
    monto numeric(14,2),
    moneda text DEFAULT 'UYU'::text,
    medio text,
    referencia text,
    notas text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: fin_cobros_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.fin_cobros_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: fin_cobros_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.fin_cobros_id_seq OWNED BY public.fin_cobros.id;


--
-- Name: fin_comprobantes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fin_comprobantes (
    id integer NOT NULL,
    tipo text,
    ref_id integer,
    path text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: fin_comprobantes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.fin_comprobantes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: fin_comprobantes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.fin_comprobantes_id_seq OWNED BY public.fin_comprobantes.id;


--
-- Name: fin_facturas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fin_facturas (
    id integer NOT NULL,
    tipo text DEFAULT 'emitida'::text,
    cliente_id integer,
    tercero text,
    numero text,
    fecha date DEFAULT CURRENT_DATE,
    vencimiento date,
    monto numeric(14,2),
    moneda text DEFAULT 'UYU'::text,
    estado text DEFAULT 'pendiente'::text,
    concepto text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: fin_facturas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.fin_facturas_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: fin_facturas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.fin_facturas_id_seq OWNED BY public.fin_facturas.id;


--
-- Name: fin_pagos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fin_pagos (
    id integer NOT NULL,
    tercero text,
    factura_id integer,
    fecha date DEFAULT CURRENT_DATE,
    monto numeric(14,2),
    moneda text DEFAULT 'UYU'::text,
    medio text,
    categoria text,
    referencia text,
    notas text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: fin_pagos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.fin_pagos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: fin_pagos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.fin_pagos_id_seq OWNED BY public.fin_pagos.id;


--
-- Name: passkeys; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.passkeys (
    id integer NOT NULL,
    user_id integer,
    credential_id text NOT NULL,
    public_key text NOT NULL,
    counter bigint DEFAULT 0,
    transports text,
    device_name text,
    created_at timestamp with time zone DEFAULT now(),
    last_used timestamp with time zone
);


--
-- Name: passkeys_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.passkeys_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: passkeys_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.passkeys_id_seq OWNED BY public.passkeys.id;


--
-- Name: planos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.planos (
    id integer NOT NULL,
    cliente_id integer,
    nombre text,
    path text,
    shapes jsonb DEFAULT '[]'::jsonb,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: planos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.planos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: planos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.planos_id_seq OWNED BY public.planos.id;


--
-- Name: posiciones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.posiciones (
    id integer NOT NULL,
    usuario text,
    nombre text,
    rol text,
    lat double precision,
    lon double precision,
    accuracy real,
    ts timestamp with time zone DEFAULT now()
);


--
-- Name: posiciones_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.posiciones_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: posiciones_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.posiciones_id_seq OWNED BY public.posiciones.id;


--
-- Name: proveedores; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.proveedores (
    id integer NOT NULL,
    nombre text,
    rubro text,
    direccion text,
    telefono text,
    lat double precision,
    lon double precision,
    activo boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: proveedores_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.proveedores_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: proveedores_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.proveedores_id_seq OWNED BY public.proveedores.id;


--
-- Name: prueba_fotos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.prueba_fotos (
    id integer NOT NULL,
    prueba_id integer NOT NULL,
    filename text,
    path text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: prueba_fotos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.prueba_fotos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: prueba_fotos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.prueba_fotos_id_seq OWNED BY public.prueba_fotos.id;


--
-- Name: pruebas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pruebas (
    id integer NOT NULL,
    visita_id integer,
    equipo_id integer NOT NULL,
    estado_id integer,
    comentarios text,
    fecha date DEFAULT CURRENT_DATE NOT NULL,
    origen text DEFAULT 'manual'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    lat double precision,
    lon double precision
);


--
-- Name: pruebas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pruebas_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pruebas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pruebas_id_seq OWNED BY public.pruebas.id;


--
-- Name: rol_permisos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rol_permisos (
    rol text NOT NULL,
    permisos jsonb DEFAULT '{}'::jsonb
);


--
-- Name: seguridad_bans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.seguridad_bans (
    ip text NOT NULL,
    pais text,
    motivo text,
    intentos integer,
    created_at timestamp with time zone DEFAULT now(),
    expira timestamp with time zone,
    activo boolean DEFAULT true
);


--
-- Name: seguridad_eventos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.seguridad_eventos (
    id bigint NOT NULL,
    ts timestamp with time zone DEFAULT now(),
    ip text,
    pais text,
    tipo text,
    detalle text,
    username text
);


--
-- Name: seguridad_eventos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.seguridad_eventos_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: seguridad_eventos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.seguridad_eventos_id_seq OWNED BY public.seguridad_eventos.id;


--
-- Name: sistemas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sistemas (
    id integer NOT NULL,
    nombre text NOT NULL
);


--
-- Name: sistemas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.sistemas_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: sistemas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.sistemas_id_seq OWNED BY public.sistemas.id;


--
-- Name: tecnicos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tecnicos (
    id integer NOT NULL,
    nombre text NOT NULL,
    telefono text,
    activo boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    avatar_path text,
    orden integer
);


--
-- Name: tecnicos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tecnicos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tecnicos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tecnicos_id_seq OWNED BY public.tecnicos.id;


--
-- Name: ticket_archivos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ticket_archivos (
    id integer NOT NULL,
    ticket_id integer,
    tipo text DEFAULT 'adjunto'::text,
    filename text,
    path text,
    mimetype text,
    comentario text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: ticket_archivos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ticket_archivos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ticket_archivos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ticket_archivos_id_seq OWNED BY public.ticket_archivos.id;


--
-- Name: ticket_comentarios; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ticket_comentarios (
    id integer NOT NULL,
    ticket_id integer,
    autor text,
    texto text,
    created_at timestamp with time zone DEFAULT now(),
    adjuntos jsonb DEFAULT '[]'::jsonb
);


--
-- Name: ticket_comentarios_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ticket_comentarios_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ticket_comentarios_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ticket_comentarios_id_seq OWNED BY public.ticket_comentarios.id;


--
-- Name: tickets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tickets (
    id integer NOT NULL,
    titulo text,
    cliente_id integer,
    prioridad text DEFAULT 'media'::text,
    estado text DEFAULT 'abierto'::text,
    asignado text,
    descripcion text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    solicitante text,
    fecha_max_resolucion date,
    facturable boolean,
    presupuesto_crm text,
    motivo_no_fact text,
    contrato_id integer
);


--
-- Name: tickets_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tickets_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tickets_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tickets_id_seq OWNED BY public.tickets.id;


--
-- Name: tipos_elemento; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tipos_elemento (
    id integer NOT NULL,
    nombre text NOT NULL,
    icono text
);


--
-- Name: tipos_elemento_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tipos_elemento_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tipos_elemento_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tipos_elemento_id_seq OWNED BY public.tipos_elemento.id;


--
-- Name: usuarios; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.usuarios (
    id integer NOT NULL,
    username text NOT NULL,
    password text NOT NULL,
    nombre text,
    rol text DEFAULT 'tecnico'::text NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    avatar_path text,
    twofa_enabled boolean DEFAULT false NOT NULL,
    twofa_secret text,
    twofa_temp text,
    twofa_backup jsonb DEFAULT '[]'::jsonb NOT NULL,
    telefono text,
    last_seen timestamp with time zone,
    email text
);


--
-- Name: usuarios_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.usuarios_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: usuarios_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.usuarios_id_seq OWNED BY public.usuarios.id;


--
-- Name: v_ultima_prueba; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_ultima_prueba AS
 SELECT DISTINCT ON (p.equipo_id) p.equipo_id,
    p.id AS prueba_id,
    p.fecha AS ultima_fecha,
    p.estado_id,
    e.nombre AS ultimo_estado,
    e.es_falla AS ultima_falla
   FROM (public.pruebas p
     LEFT JOIN public.estados_equipo e ON ((e.id = p.estado_id)))
  ORDER BY p.equipo_id, p.fecha DESC, p.id DESC;


--
-- Name: vehiculo_fotos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vehiculo_fotos (
    id integer NOT NULL,
    vehiculo_id integer,
    path text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: vehiculo_fotos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.vehiculo_fotos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: vehiculo_fotos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.vehiculo_fotos_id_seq OWNED BY public.vehiculo_fotos.id;


--
-- Name: vehiculo_registro_fotos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vehiculo_registro_fotos (
    id integer NOT NULL,
    registro_id integer,
    path text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: vehiculo_registro_fotos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.vehiculo_registro_fotos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: vehiculo_registro_fotos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.vehiculo_registro_fotos_id_seq OWNED BY public.vehiculo_registro_fotos.id;


--
-- Name: vehiculo_registros; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vehiculo_registros (
    id integer NOT NULL,
    vehiculo_id integer,
    tipo text DEFAULT 'service'::text,
    fecha date DEFAULT CURRENT_DATE,
    costo numeric,
    odometro integer,
    detalle text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: vehiculo_registros_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.vehiculo_registros_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: vehiculo_registros_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.vehiculo_registros_id_seq OWNED BY public.vehiculo_registros.id;


--
-- Name: vehiculos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vehiculos (
    id integer NOT NULL,
    nombre text,
    patente text,
    tipo text,
    marca text,
    modelo text,
    anio integer,
    odometro integer,
    notas text,
    activo boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    service_cada_km integer,
    service_cada_meses integer
);


--
-- Name: vehiculos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.vehiculos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: vehiculos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.vehiculos_id_seq OWNED BY public.vehiculos.id;


--
-- Name: visita_archivos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.visita_archivos (
    id integer NOT NULL,
    visita_id integer NOT NULL,
    tipo text DEFAULT 'foto'::text NOT NULL,
    filename text,
    path text NOT NULL,
    mimetype text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    comentario text
);


--
-- Name: visita_archivos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.visita_archivos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: visita_archivos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.visita_archivos_id_seq OWNED BY public.visita_archivos.id;


--
-- Name: visita_jornadas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.visita_jornadas (
    id integer NOT NULL,
    visita_id integer NOT NULL,
    fecha date NOT NULL,
    orden integer DEFAULT 1 NOT NULL,
    estado text DEFAULT 'planificada'::text NOT NULL,
    tecnico_id integer,
    hora_inicio timestamp with time zone,
    hora_fin timestamp with time zone,
    nota text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: visita_jornadas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.visita_jornadas_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: visita_jornadas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.visita_jornadas_id_seq OWNED BY public.visita_jornadas.id;


--
-- Name: visita_tareas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.visita_tareas (
    id integer NOT NULL,
    visita_id integer,
    descripcion text,
    prioridad text DEFAULT 'media'::text,
    resuelta boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: visita_tareas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.visita_tareas_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: visita_tareas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.visita_tareas_id_seq OWNED BY public.visita_tareas.id;


--
-- Name: visita_tecnicos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.visita_tecnicos (
    visita_id integer NOT NULL,
    tecnico_id integer NOT NULL
);


--
-- Name: visitas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.visitas (
    id integer NOT NULL,
    cliente_id integer NOT NULL,
    fecha date DEFAULT CURRENT_DATE NOT NULL,
    tecnico_id integer,
    situacion_inicial text,
    acciones text,
    situacion_final text,
    firma_path text,
    cerrada boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    estado text DEFAULT 'programada'::text NOT NULL,
    hora_entrada timestamp with time zone,
    hora_salida timestamp with time zone,
    firma_lat double precision,
    firma_lon double precision,
    entrada_lat double precision,
    entrada_lon double precision,
    salida_lat double precision,
    salida_lon double precision,
    facturar boolean,
    asignada_por text,
    tipo text DEFAULT 'preventiva'::text,
    orden integer,
    hora time without time zone,
    firmante_nombre text,
    firmante_doc text,
    contrato_id integer,
    ticket_id integer,
    fecha_max_resolucion date,
    cancelada_motivo text,
    cancelada_por text,
    cancelada_at timestamp with time zone,
    fecha_fin date,
    multidia boolean DEFAULT false,
    titulo text
);


--
-- Name: visitas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.visitas_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: visitas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.visitas_id_seq OWNED BY public.visitas.id;


--
-- Name: auditoria id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auditoria ALTER COLUMN id SET DEFAULT nextval('public.auditoria_id_seq'::regclass);


--
-- Name: chatbot_numeros id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_numeros ALTER COLUMN id SET DEFAULT nextval('public.chatbot_numeros_id_seq'::regclass);


--
-- Name: cliente_archivos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cliente_archivos ALTER COLUMN id SET DEFAULT nextval('public.cliente_archivos_id_seq'::regclass);


--
-- Name: cliente_contactos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cliente_contactos ALTER COLUMN id SET DEFAULT nextval('public.cliente_contactos_id_seq'::regclass);


--
-- Name: cliente_credenciales id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cliente_credenciales ALTER COLUMN id SET DEFAULT nextval('public.cliente_credenciales_id_seq'::regclass);


--
-- Name: clientes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clientes ALTER COLUMN id SET DEFAULT nextval('public.clientes_id_seq'::regclass);


--
-- Name: contratos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contratos ALTER COLUMN id SET DEFAULT nextval('public.contratos_id_seq'::regclass);


--
-- Name: equipos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.equipos ALTER COLUMN id SET DEFAULT nextval('public.equipos_id_seq'::regclass);


--
-- Name: equipos_estandar id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.equipos_estandar ALTER COLUMN id SET DEFAULT nextval('public.equipos_estandar_id_seq'::regclass);


--
-- Name: estados_equipo id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estados_equipo ALTER COLUMN id SET DEFAULT nextval('public.estados_equipo_id_seq'::regclass);


--
-- Name: fin_cobros id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fin_cobros ALTER COLUMN id SET DEFAULT nextval('public.fin_cobros_id_seq'::regclass);


--
-- Name: fin_comprobantes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fin_comprobantes ALTER COLUMN id SET DEFAULT nextval('public.fin_comprobantes_id_seq'::regclass);


--
-- Name: fin_facturas id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fin_facturas ALTER COLUMN id SET DEFAULT nextval('public.fin_facturas_id_seq'::regclass);


--
-- Name: fin_pagos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fin_pagos ALTER COLUMN id SET DEFAULT nextval('public.fin_pagos_id_seq'::regclass);


--
-- Name: passkeys id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.passkeys ALTER COLUMN id SET DEFAULT nextval('public.passkeys_id_seq'::regclass);


--
-- Name: planos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.planos ALTER COLUMN id SET DEFAULT nextval('public.planos_id_seq'::regclass);


--
-- Name: posiciones id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.posiciones ALTER COLUMN id SET DEFAULT nextval('public.posiciones_id_seq'::regclass);


--
-- Name: proveedores id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proveedores ALTER COLUMN id SET DEFAULT nextval('public.proveedores_id_seq'::regclass);


--
-- Name: prueba_fotos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prueba_fotos ALTER COLUMN id SET DEFAULT nextval('public.prueba_fotos_id_seq'::regclass);


--
-- Name: pruebas id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pruebas ALTER COLUMN id SET DEFAULT nextval('public.pruebas_id_seq'::regclass);


--
-- Name: seguridad_eventos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.seguridad_eventos ALTER COLUMN id SET DEFAULT nextval('public.seguridad_eventos_id_seq'::regclass);


--
-- Name: sistemas id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sistemas ALTER COLUMN id SET DEFAULT nextval('public.sistemas_id_seq'::regclass);


--
-- Name: tecnicos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tecnicos ALTER COLUMN id SET DEFAULT nextval('public.tecnicos_id_seq'::regclass);


--
-- Name: ticket_archivos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ticket_archivos ALTER COLUMN id SET DEFAULT nextval('public.ticket_archivos_id_seq'::regclass);


--
-- Name: ticket_comentarios id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ticket_comentarios ALTER COLUMN id SET DEFAULT nextval('public.ticket_comentarios_id_seq'::regclass);


--
-- Name: tickets id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tickets ALTER COLUMN id SET DEFAULT nextval('public.tickets_id_seq'::regclass);


--
-- Name: tipos_elemento id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tipos_elemento ALTER COLUMN id SET DEFAULT nextval('public.tipos_elemento_id_seq'::regclass);


--
-- Name: usuarios id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios ALTER COLUMN id SET DEFAULT nextval('public.usuarios_id_seq'::regclass);


--
-- Name: vehiculo_fotos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vehiculo_fotos ALTER COLUMN id SET DEFAULT nextval('public.vehiculo_fotos_id_seq'::regclass);


--
-- Name: vehiculo_registro_fotos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vehiculo_registro_fotos ALTER COLUMN id SET DEFAULT nextval('public.vehiculo_registro_fotos_id_seq'::regclass);


--
-- Name: vehiculo_registros id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vehiculo_registros ALTER COLUMN id SET DEFAULT nextval('public.vehiculo_registros_id_seq'::regclass);


--
-- Name: vehiculos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vehiculos ALTER COLUMN id SET DEFAULT nextval('public.vehiculos_id_seq'::regclass);


--
-- Name: visita_archivos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visita_archivos ALTER COLUMN id SET DEFAULT nextval('public.visita_archivos_id_seq'::regclass);


--
-- Name: visita_jornadas id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visita_jornadas ALTER COLUMN id SET DEFAULT nextval('public.visita_jornadas_id_seq'::regclass);


--
-- Name: visita_tareas id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visita_tareas ALTER COLUMN id SET DEFAULT nextval('public.visita_tareas_id_seq'::regclass);


--
-- Name: visitas id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visitas ALTER COLUMN id SET DEFAULT nextval('public.visitas_id_seq'::regclass);


--
-- Name: app_config app_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_config
    ADD CONSTRAINT app_config_pkey PRIMARY KEY (clave);


--
-- Name: auditoria auditoria_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auditoria
    ADD CONSTRAINT auditoria_pkey PRIMARY KEY (id);


--
-- Name: chatbot_numeros chatbot_numeros_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_numeros
    ADD CONSTRAINT chatbot_numeros_pkey PRIMARY KEY (id);


--
-- Name: chatbot_numeros chatbot_numeros_telefono_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_numeros
    ADD CONSTRAINT chatbot_numeros_telefono_key UNIQUE (telefono);


--
-- Name: cliente_archivos cliente_archivos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cliente_archivos
    ADD CONSTRAINT cliente_archivos_pkey PRIMARY KEY (id);


--
-- Name: cliente_contactos cliente_contactos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cliente_contactos
    ADD CONSTRAINT cliente_contactos_pkey PRIMARY KEY (id);


--
-- Name: cliente_credenciales cliente_credenciales_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cliente_credenciales
    ADD CONSTRAINT cliente_credenciales_pkey PRIMARY KEY (id);


--
-- Name: clientes clientes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clientes
    ADD CONSTRAINT clientes_pkey PRIMARY KEY (id);


--
-- Name: contratos contratos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contratos
    ADD CONSTRAINT contratos_pkey PRIMARY KEY (id);


--
-- Name: equipos equipos_codigo_qr_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.equipos
    ADD CONSTRAINT equipos_codigo_qr_key UNIQUE (codigo_qr);


--
-- Name: equipos_estandar equipos_estandar_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.equipos_estandar
    ADD CONSTRAINT equipos_estandar_pkey PRIMARY KEY (id);


--
-- Name: equipos equipos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.equipos
    ADD CONSTRAINT equipos_pkey PRIMARY KEY (id);


--
-- Name: estados_equipo estados_equipo_nombre_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estados_equipo
    ADD CONSTRAINT estados_equipo_nombre_key UNIQUE (nombre);


--
-- Name: estados_equipo estados_equipo_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estados_equipo
    ADD CONSTRAINT estados_equipo_pkey PRIMARY KEY (id);


--
-- Name: fin_cobros fin_cobros_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fin_cobros
    ADD CONSTRAINT fin_cobros_pkey PRIMARY KEY (id);


--
-- Name: fin_comprobantes fin_comprobantes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fin_comprobantes
    ADD CONSTRAINT fin_comprobantes_pkey PRIMARY KEY (id);


--
-- Name: fin_facturas fin_facturas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fin_facturas
    ADD CONSTRAINT fin_facturas_pkey PRIMARY KEY (id);


--
-- Name: fin_pagos fin_pagos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fin_pagos
    ADD CONSTRAINT fin_pagos_pkey PRIMARY KEY (id);


--
-- Name: passkeys passkeys_credential_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.passkeys
    ADD CONSTRAINT passkeys_credential_id_key UNIQUE (credential_id);


--
-- Name: passkeys passkeys_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.passkeys
    ADD CONSTRAINT passkeys_pkey PRIMARY KEY (id);


--
-- Name: planos planos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.planos
    ADD CONSTRAINT planos_pkey PRIMARY KEY (id);


--
-- Name: posiciones posiciones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.posiciones
    ADD CONSTRAINT posiciones_pkey PRIMARY KEY (id);


--
-- Name: proveedores proveedores_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proveedores
    ADD CONSTRAINT proveedores_pkey PRIMARY KEY (id);


--
-- Name: prueba_fotos prueba_fotos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prueba_fotos
    ADD CONSTRAINT prueba_fotos_pkey PRIMARY KEY (id);


--
-- Name: pruebas pruebas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pruebas
    ADD CONSTRAINT pruebas_pkey PRIMARY KEY (id);


--
-- Name: rol_permisos rol_permisos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rol_permisos
    ADD CONSTRAINT rol_permisos_pkey PRIMARY KEY (rol);


--
-- Name: seguridad_bans seguridad_bans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.seguridad_bans
    ADD CONSTRAINT seguridad_bans_pkey PRIMARY KEY (ip);


--
-- Name: seguridad_eventos seguridad_eventos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.seguridad_eventos
    ADD CONSTRAINT seguridad_eventos_pkey PRIMARY KEY (id);


--
-- Name: sistemas sistemas_nombre_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sistemas
    ADD CONSTRAINT sistemas_nombre_key UNIQUE (nombre);


--
-- Name: sistemas sistemas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sistemas
    ADD CONSTRAINT sistemas_pkey PRIMARY KEY (id);


--
-- Name: tecnicos tecnicos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tecnicos
    ADD CONSTRAINT tecnicos_pkey PRIMARY KEY (id);


--
-- Name: ticket_archivos ticket_archivos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ticket_archivos
    ADD CONSTRAINT ticket_archivos_pkey PRIMARY KEY (id);


--
-- Name: ticket_comentarios ticket_comentarios_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ticket_comentarios
    ADD CONSTRAINT ticket_comentarios_pkey PRIMARY KEY (id);


--
-- Name: tickets tickets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_pkey PRIMARY KEY (id);


--
-- Name: tipos_elemento tipos_elemento_nombre_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tipos_elemento
    ADD CONSTRAINT tipos_elemento_nombre_key UNIQUE (nombre);


--
-- Name: tipos_elemento tipos_elemento_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tipos_elemento
    ADD CONSTRAINT tipos_elemento_pkey PRIMARY KEY (id);


--
-- Name: usuarios usuarios_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT usuarios_pkey PRIMARY KEY (id);


--
-- Name: usuarios usuarios_username_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT usuarios_username_key UNIQUE (username);


--
-- Name: vehiculo_fotos vehiculo_fotos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vehiculo_fotos
    ADD CONSTRAINT vehiculo_fotos_pkey PRIMARY KEY (id);


--
-- Name: vehiculo_registro_fotos vehiculo_registro_fotos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vehiculo_registro_fotos
    ADD CONSTRAINT vehiculo_registro_fotos_pkey PRIMARY KEY (id);


--
-- Name: vehiculo_registros vehiculo_registros_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vehiculo_registros
    ADD CONSTRAINT vehiculo_registros_pkey PRIMARY KEY (id);


--
-- Name: vehiculos vehiculos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vehiculos
    ADD CONSTRAINT vehiculos_pkey PRIMARY KEY (id);


--
-- Name: visita_archivos visita_archivos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visita_archivos
    ADD CONSTRAINT visita_archivos_pkey PRIMARY KEY (id);


--
-- Name: visita_jornadas visita_jornadas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visita_jornadas
    ADD CONSTRAINT visita_jornadas_pkey PRIMARY KEY (id);


--
-- Name: visita_tareas visita_tareas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visita_tareas
    ADD CONSTRAINT visita_tareas_pkey PRIMARY KEY (id);


--
-- Name: visita_tecnicos visita_tecnicos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visita_tecnicos
    ADD CONSTRAINT visita_tecnicos_pkey PRIMARY KEY (visita_id, tecnico_id);


--
-- Name: visitas visitas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visitas
    ADD CONSTRAINT visitas_pkey PRIMARY KEY (id);


--
-- Name: idx_equipos_cliente; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_equipos_cliente ON public.equipos USING btree (cliente_id);


--
-- Name: idx_equipos_codigo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_equipos_codigo ON public.equipos USING btree (codigo_qr);


--
-- Name: idx_posiciones_ts; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_posiciones_ts ON public.posiciones USING btree (ts DESC);


--
-- Name: idx_pruebas_equipo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pruebas_equipo ON public.pruebas USING btree (equipo_id);


--
-- Name: idx_pruebas_fecha; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pruebas_fecha ON public.pruebas USING btree (fecha);


--
-- Name: idx_pruebas_visita; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pruebas_visita ON public.pruebas USING btree (visita_id);


--
-- Name: idx_visitas_cliente; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_visitas_cliente ON public.visitas USING btree (cliente_id);


--
-- Name: idx_vjorn_fecha; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vjorn_fecha ON public.visita_jornadas USING btree (fecha);


--
-- Name: idx_vjorn_visita; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vjorn_visita ON public.visita_jornadas USING btree (visita_id);


--
-- Name: ix_seg_ev_ts; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_seg_ev_ts ON public.seguridad_eventos USING btree (ts DESC);


--
-- Name: cliente_archivos cliente_archivos_cliente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cliente_archivos
    ADD CONSTRAINT cliente_archivos_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.clientes(id) ON DELETE CASCADE;


--
-- Name: cliente_contactos cliente_contactos_cliente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cliente_contactos
    ADD CONSTRAINT cliente_contactos_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.clientes(id) ON DELETE CASCADE;


--
-- Name: cliente_credenciales cliente_credenciales_cliente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cliente_credenciales
    ADD CONSTRAINT cliente_credenciales_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.clientes(id) ON DELETE CASCADE;


--
-- Name: contratos contratos_cliente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contratos
    ADD CONSTRAINT contratos_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.clientes(id) ON DELETE CASCADE;


--
-- Name: equipos equipos_cliente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.equipos
    ADD CONSTRAINT equipos_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.clientes(id) ON DELETE CASCADE;


--
-- Name: equipos equipos_sistema_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.equipos
    ADD CONSTRAINT equipos_sistema_id_fkey FOREIGN KEY (sistema_id) REFERENCES public.sistemas(id);


--
-- Name: equipos equipos_tipo_elemento_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.equipos
    ADD CONSTRAINT equipos_tipo_elemento_id_fkey FOREIGN KEY (tipo_elemento_id) REFERENCES public.tipos_elemento(id);


--
-- Name: fin_cobros fin_cobros_cliente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fin_cobros
    ADD CONSTRAINT fin_cobros_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.clientes(id) ON DELETE SET NULL;


--
-- Name: fin_cobros fin_cobros_factura_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fin_cobros
    ADD CONSTRAINT fin_cobros_factura_id_fkey FOREIGN KEY (factura_id) REFERENCES public.fin_facturas(id) ON DELETE SET NULL;


--
-- Name: fin_facturas fin_facturas_cliente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fin_facturas
    ADD CONSTRAINT fin_facturas_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.clientes(id) ON DELETE SET NULL;


--
-- Name: fin_pagos fin_pagos_factura_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fin_pagos
    ADD CONSTRAINT fin_pagos_factura_id_fkey FOREIGN KEY (factura_id) REFERENCES public.fin_facturas(id) ON DELETE SET NULL;


--
-- Name: passkeys passkeys_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.passkeys
    ADD CONSTRAINT passkeys_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.usuarios(id) ON DELETE CASCADE;


--
-- Name: planos planos_cliente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.planos
    ADD CONSTRAINT planos_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.clientes(id) ON DELETE CASCADE;


--
-- Name: prueba_fotos prueba_fotos_prueba_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prueba_fotos
    ADD CONSTRAINT prueba_fotos_prueba_id_fkey FOREIGN KEY (prueba_id) REFERENCES public.pruebas(id) ON DELETE CASCADE;


--
-- Name: pruebas pruebas_equipo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pruebas
    ADD CONSTRAINT pruebas_equipo_id_fkey FOREIGN KEY (equipo_id) REFERENCES public.equipos(id) ON DELETE CASCADE;


--
-- Name: pruebas pruebas_estado_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pruebas
    ADD CONSTRAINT pruebas_estado_id_fkey FOREIGN KEY (estado_id) REFERENCES public.estados_equipo(id);


--
-- Name: pruebas pruebas_visita_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pruebas
    ADD CONSTRAINT pruebas_visita_id_fkey FOREIGN KEY (visita_id) REFERENCES public.visitas(id) ON DELETE CASCADE;


--
-- Name: ticket_archivos ticket_archivos_ticket_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ticket_archivos
    ADD CONSTRAINT ticket_archivos_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES public.tickets(id) ON DELETE CASCADE;


--
-- Name: ticket_comentarios ticket_comentarios_ticket_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ticket_comentarios
    ADD CONSTRAINT ticket_comentarios_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES public.tickets(id) ON DELETE CASCADE;


--
-- Name: tickets tickets_cliente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.clientes(id) ON DELETE SET NULL;


--
-- Name: tickets tickets_contrato_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_contrato_id_fkey FOREIGN KEY (contrato_id) REFERENCES public.contratos(id) ON DELETE SET NULL;


--
-- Name: vehiculo_fotos vehiculo_fotos_vehiculo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vehiculo_fotos
    ADD CONSTRAINT vehiculo_fotos_vehiculo_id_fkey FOREIGN KEY (vehiculo_id) REFERENCES public.vehiculos(id) ON DELETE CASCADE;


--
-- Name: vehiculo_registro_fotos vehiculo_registro_fotos_registro_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vehiculo_registro_fotos
    ADD CONSTRAINT vehiculo_registro_fotos_registro_id_fkey FOREIGN KEY (registro_id) REFERENCES public.vehiculo_registros(id) ON DELETE CASCADE;


--
-- Name: vehiculo_registros vehiculo_registros_vehiculo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vehiculo_registros
    ADD CONSTRAINT vehiculo_registros_vehiculo_id_fkey FOREIGN KEY (vehiculo_id) REFERENCES public.vehiculos(id) ON DELETE CASCADE;


--
-- Name: visita_archivos visita_archivos_visita_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visita_archivos
    ADD CONSTRAINT visita_archivos_visita_id_fkey FOREIGN KEY (visita_id) REFERENCES public.visitas(id) ON DELETE CASCADE;


--
-- Name: visita_jornadas visita_jornadas_tecnico_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visita_jornadas
    ADD CONSTRAINT visita_jornadas_tecnico_id_fkey FOREIGN KEY (tecnico_id) REFERENCES public.tecnicos(id) ON DELETE SET NULL;


--
-- Name: visita_jornadas visita_jornadas_visita_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visita_jornadas
    ADD CONSTRAINT visita_jornadas_visita_id_fkey FOREIGN KEY (visita_id) REFERENCES public.visitas(id) ON DELETE CASCADE;


--
-- Name: visita_tareas visita_tareas_visita_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visita_tareas
    ADD CONSTRAINT visita_tareas_visita_id_fkey FOREIGN KEY (visita_id) REFERENCES public.visitas(id) ON DELETE CASCADE;


--
-- Name: visita_tecnicos visita_tecnicos_tecnico_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visita_tecnicos
    ADD CONSTRAINT visita_tecnicos_tecnico_id_fkey FOREIGN KEY (tecnico_id) REFERENCES public.tecnicos(id) ON DELETE CASCADE;


--
-- Name: visita_tecnicos visita_tecnicos_visita_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visita_tecnicos
    ADD CONSTRAINT visita_tecnicos_visita_id_fkey FOREIGN KEY (visita_id) REFERENCES public.visitas(id) ON DELETE CASCADE;


--
-- Name: visitas visitas_cliente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visitas
    ADD CONSTRAINT visitas_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.clientes(id) ON DELETE CASCADE;


--
-- Name: visitas visitas_contrato_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visitas
    ADD CONSTRAINT visitas_contrato_id_fkey FOREIGN KEY (contrato_id) REFERENCES public.contratos(id) ON DELETE SET NULL;


--
-- Name: visitas visitas_tecnico_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visitas
    ADD CONSTRAINT visitas_tecnico_id_fkey FOREIGN KEY (tecnico_id) REFERENCES public.tecnicos(id);


--
-- Name: visitas visitas_ticket_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visitas
    ADD CONSTRAINT visitas_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES public.tickets(id) ON DELETE SET NULL;


--
-- PostgreSQL database dump complete
--


