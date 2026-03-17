--
-- PostgreSQL database dump
--

\restrict bEyS8Cv76thC86XfUee7ADJxRrZghrGmMYDgJcQGOnIYN0bYCHipH5J4DkroWpM

-- Dumped from database version 18.3
-- Dumped by pg_dump version 18.3

-- Started on 2026-03-17 16:24:15

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- TOC entry 228 (class 1259 OID 16645)
-- Name: game_deviations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.game_deviations (
    id integer NOT NULL,
    game_id integer,
    move_number integer,
    move_uci text,
    position_id integer,
    deviation_depth integer,
    line_depth integer,
    completion_percentage double precision,
    opponent_deviation boolean
);


ALTER TABLE public.game_deviations OWNER TO postgres;

--
-- TOC entry 226 (class 1259 OID 16637)
-- Name: games; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.games (
    id integer NOT NULL,
    result character varying(10)
);


ALTER TABLE public.games OWNER TO postgres;

--
-- TOC entry 229 (class 1259 OID 16673)
-- Name: deviation_stats; Type: MATERIALIZED VIEW; Schema: public; Owner: postgres
--

CREATE MATERIALIZED VIEW public.deviation_stats AS
 SELECT gd.move_number,
    gd.opponent_deviation,
    count(*) AS total_games,
    round((avg(
        CASE
            WHEN ((g.result)::text = '1-0'::text) THEN 1.0
            WHEN ((g.result)::text = '0-1'::text) THEN 0.0
            ELSE 0.5
        END) * (100)::numeric), 2) AS avg_score_percent
   FROM (public.game_deviations gd
     JOIN public.games g ON ((g.id = gd.game_id)))
  GROUP BY gd.move_number, gd.opponent_deviation
  WITH NO DATA;


ALTER MATERIALIZED VIEW public.deviation_stats OWNER TO postgres;

--
-- TOC entry 227 (class 1259 OID 16644)
-- Name: game_deviations_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.game_deviations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.game_deviations_id_seq OWNER TO postgres;

--
-- TOC entry 4962 (class 0 OID 0)
-- Dependencies: 227
-- Name: game_deviations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.game_deviations_id_seq OWNED BY public.game_deviations.id;


--
-- TOC entry 225 (class 1259 OID 16636)
-- Name: games_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.games_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.games_id_seq OWNER TO postgres;

--
-- TOC entry 4963 (class 0 OID 0)
-- Dependencies: 225
-- Name: games_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.games_id_seq OWNED BY public.games.id;


--
-- TOC entry 224 (class 1259 OID 16608)
-- Name: opening_tree; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.opening_tree (
    id integer NOT NULL,
    parent_id integer,
    move_san text,
    opening_name character varying(255),
    eco_code character varying(10)
);


ALTER TABLE public.opening_tree OWNER TO postgres;

--
-- TOC entry 223 (class 1259 OID 16607)
-- Name: opening_tree_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.opening_tree_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.opening_tree_id_seq OWNER TO postgres;

--
-- TOC entry 4964 (class 0 OID 0)
-- Dependencies: 223
-- Name: opening_tree_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.opening_tree_id_seq OWNED BY public.opening_tree.id;


--
-- TOC entry 222 (class 1259 OID 16534)
-- Name: pgn_games; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.pgn_games (
    id integer NOT NULL,
    opening_name character varying(255),
    eco_code character varying(10),
    result character varying(10),
    pgn_data text
);


ALTER TABLE public.pgn_games OWNER TO postgres;

--
-- TOC entry 221 (class 1259 OID 16533)
-- Name: pgn_games_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.pgn_games_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.pgn_games_id_seq OWNER TO postgres;

--
-- TOC entry 4965 (class 0 OID 0)
-- Dependencies: 221
-- Name: pgn_games_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.pgn_games_id_seq OWNED BY public.pgn_games.id;


--
-- TOC entry 220 (class 1259 OID 16511)
-- Name: white_opening; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.white_opening (
    id integer NOT NULL,
    opening_name character varying(255),
    eco_code character varying(10),
    moves text
);


ALTER TABLE public.white_opening OWNER TO postgres;

--
-- TOC entry 219 (class 1259 OID 16510)
-- Name: white_opening_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.white_opening_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.white_opening_id_seq OWNER TO postgres;

--
-- TOC entry 4966 (class 0 OID 0)
-- Dependencies: 219
-- Name: white_opening_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.white_opening_id_seq OWNED BY public.white_opening.id;


--
-- TOC entry 4783 (class 2604 OID 16648)
-- Name: game_deviations id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.game_deviations ALTER COLUMN id SET DEFAULT nextval('public.game_deviations_id_seq'::regclass);


--
-- TOC entry 4782 (class 2604 OID 16640)
-- Name: games id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.games ALTER COLUMN id SET DEFAULT nextval('public.games_id_seq'::regclass);


--
-- TOC entry 4781 (class 2604 OID 16611)
-- Name: opening_tree id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.opening_tree ALTER COLUMN id SET DEFAULT nextval('public.opening_tree_id_seq'::regclass);


--
-- TOC entry 4780 (class 2604 OID 16537)
-- Name: pgn_games id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pgn_games ALTER COLUMN id SET DEFAULT nextval('public.pgn_games_id_seq'::regclass);


--
-- TOC entry 4779 (class 2604 OID 16514)
-- Name: white_opening id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.white_opening ALTER COLUMN id SET DEFAULT nextval('public.white_opening_id_seq'::regclass);


--
-- TOC entry 4955 (class 0 OID 16645)
-- Dependencies: 228
-- Data for Name: game_deviations; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.game_deviations (id, game_id, move_number, move_uci, position_id, deviation_depth, line_depth, completion_percentage, opponent_deviation) FROM stdin;
1	1	4	Nbd7	283	0	7	0	\N
2	2	2	Bf5	3	0	3	0	\N
3	3	1	b6	1	0	1	0	\N
4	4	4	Nbd7	283	0	7	0	\N
5	5	2	Bf5	3	0	3	0	\N
6	6	1	b6	1	0	1	0	\N
\.


--
-- TOC entry 4953 (class 0 OID 16637)
-- Dependencies: 226
-- Data for Name: games; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.games (id, result) FROM stdin;
1	0-1
2	1-0
3	1-0
4	0-1
5	1-0
6	1-0
\.


--
-- TOC entry 4951 (class 0 OID 16608)
-- Dependencies: 224
-- Data for Name: opening_tree; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.opening_tree (id, parent_id, move_san, opening_name, eco_code) FROM stdin;
1	0	Nf3	KIA	A07
2	1	d5	KIA	A07
3	2	g3	KIA	A07
4	3	Nf6	KIA	A07
5	4	Bg2	KIA	A07
6	5	c5	KIA	A07
7	6	O-O	KIA	A07
8	7	Nc6	KIA	A07
9	8	d4	KIA	A07
10	9	cxd4	KIA	A07
11	10	Nxd4	KIA	A07
12	11	e5	KIA	A07
13	12	Nxc6	KIA	A07
14	13	bxc6	KIA	A07
15	14	c4	KIA	A07
16	9	e6	KIA	A07
17	16	dxc5	KIA	A07
18	17	Bxc5	KIA	A07
19	18	c4	KIA	A07
20	7	g6	KIA	A07
21	20	d4	KIA	A07
22	21	cxd4	KIA	A07
23	22	Nxd4	KIA	A07
24	23	e5	KIA	A07
25	24	Nb3	KIA	A07
26	25	Be6	KIA	A07
27	26	c4	KIA	A07
28	23	Bg7	KIA	A07
29	28	Nb3	KIA	A07
30	29	Nc6	KIA	A07
31	30	Nc3	KIA	A07
32	31	e6	KIA	A07
33	32	e4	KIA	A07
34	21	Bg7	KIA	A07
35	34	dxc5	KIA	A07
36	5	c6	KIA Yugoslav Variation	A07
37	36	O-O	KIA Yugoslav Variation	A07
38	37	Bg4	KIA Yugoslav Variation	A07
39	38	h3	KIA Yugoslav Variation	A07
40	39	Bxf3	KIA Yugoslav Variation	A07
41	40	Bxf3	KIA Yugoslav Variation	A07
42	41	e5	KIA Yugoslav Variation	A07
43	42	d4	KIA Yugoslav Variation	A07
44	43	e4	KIA Yugoslav Variation	A07
45	44	Bg2	KIA Yugoslav Variation	A07
46	45	Be7	KIA Yugoslav Variation	A07
47	46	c4	KIA Yugoslav Variation	A07
48	39	Bh5	KIA Yugoslav Variation	A07
49	48	c4	KIA Yugoslav Variation	A07
50	49	dxc4	KIA Yugoslav Variation	A07
51	50	Na3	KIA Yugoslav Variation	A07
52	51	b5	KIA Yugoslav Variation	A07
53	52	Ne5	KIA Yugoslav Variation	A07
54	53	Nd5	KIA Yugoslav Variation	A07
55	54	d3	KIA Yugoslav Variation	A07
56	55	cxd3	KIA Yugoslav Variation	A07
57	56	Nxd3	KIA Yugoslav Variation	A07
58	57	e6	KIA Yugoslav Variation	A07
59	58	Nxb5	KIA Yugoslav Variation	A07
60	59	cxb5	KIA Yugoslav Variation	A07
61	60	Nf4	KIA Yugoslav Variation	A07
62	55	c3	KIA Yugoslav Variation	A07
63	62	Qb3	KIA Yugoslav Variation	A07
64	63	b4	KIA Yugoslav Variation	A07
65	64	bxc3	KIA Yugoslav Variation	A07
66	65	bxa3	KIA Yugoslav Variation	A07
67	66	Qb7	KIA Yugoslav Variation	A07
68	67	Nd7	KIA Yugoslav Variation	A07
69	68	Nxd7	KIA Yugoslav Variation	A07
70	69	Qc8	KIA Yugoslav Variation	A07
71	70	Qxc8+	KIA Yugoslav Variation	A07
72	71	Rxc8	KIA Yugoslav Variation	A07
73	72	Nxf8	KIA Yugoslav Variation	A07
74	63	e6	KIA Yugoslav Variation	A07
75	74	bxc3	KIA Yugoslav Variation	A07
76	49	e6	KIA Yugoslav Variation	A07
77	76	d4	KIA Yugoslav Variation	A07
78	77	Nbd7	KIA Yugoslav Variation	A07
79	78	cxd5	KIA Yugoslav Variation	A07
80	79	exd5	KIA Yugoslav Variation	A07
81	80	Nh4	KIA Yugoslav Variation	A07
82	81	Be7	KIA Yugoslav Variation	A07
83	82	Qb3	KIA Yugoslav Variation	A07
84	83	Qb6	KIA Yugoslav Variation	A07
85	84	Qe3	KIA Yugoslav Variation	A07
86	85	Bg6	KIA Yugoslav Variation	A07
87	86	Nxg6	KIA Yugoslav Variation	A07
88	87	hxg6	KIA Yugoslav Variation	A07
89	79	cxd5	KIA Yugoslav Variation	A07
90	89	Nc3	KIA Yugoslav Variation	A07
91	90	Be7	KIA Yugoslav Variation	A07
92	91	Ne5	KIA Yugoslav Variation	A07
93	92	O-O	KIA Yugoslav Variation	A07
94	93	g4	KIA Yugoslav Variation	A07
95	94	Bg6	KIA Yugoslav Variation	A07
96	95	f4	KIA Yugoslav Variation	A07
97	96	Be4	KIA Yugoslav Variation	A07
98	97	Nxd7	KIA Yugoslav Variation	A07
99	77	Be7	KIA Yugoslav Variation	A07
100	99	Nc3	KIA Yugoslav Variation	A07
101	100	O-O	KIA Yugoslav Variation	A07
102	101	g4	KIA Yugoslav Variation	A07
103	102	Bg6	KIA Yugoslav Variation	A07
104	103	Ne5	KIA Yugoslav Variation	A07
105	100	Bxf3	KIA Yugoslav Variation	A07
106	105	Bxf3	KIA Yugoslav Variation	A07
107	106	dxc4	KIA Yugoslav Variation	A07
108	107	b3	KIA Yugoslav Variation	A07
109	108	cxb3	KIA Yugoslav Variation	A07
110	109	Qxb3	KIA Yugoslav Variation	A07
111	110	Qb6	KIA Yugoslav Variation	A07
112	111	Qd1	KIA Yugoslav Variation	A07
113	112	O-O	KIA Yugoslav Variation	A07
114	113	Rb1	KIA Yugoslav Variation	A07
115	114	Qa6	KIA Yugoslav Variation	A07
116	115	Qb3	KIA Yugoslav Variation	A07
117	37	e6	KIA	A07
118	117	d4	KIA	A07
119	118	Be7	KIA	A07
120	119	Nbd2	KIA	A07
121	120	O-O	KIA	A07
122	121	Re1	KIA	A07
123	122	Re8	KIA	A07
124	123	e4	KIA	A07
125	124	dxe4	KIA	A07
126	125	Nxe4	KIA	A07
127	126	Nxe4	KIA	A07
128	127	Rxe4	KIA	A07
129	118	Nbd7	KIA	A07
130	129	Nbd2	KIA	A07
131	130	Be7	KIA	A07
132	131	Re1	KIA	A07
133	132	O-O	KIA	A07
134	133	e4	KIA	A07
135	134	dxe4	KIA	A07
136	135	Nxe4	KIA	A07
137	136	Nxe4	KIA	A07
138	137	Rxe4	KIA	A07
139	130	Bd6	KIA	A07
140	139	Re1	KIA	A07
141	140	O-O	KIA	A07
142	141	e4	KIA	A07
143	142	dxe4	KIA	A07
144	143	Nxe4	KIA	A07
145	144	Nxe4	KIA	A07
146	145	Rxe4	KIA	A07
147	118	Bd6	KIA	A07
148	147	Re1	KIA	A07
149	148	O-O	KIA	A07
150	149	Nbd2	KIA	A07
151	37	Bf5	KIA	A07
152	151	c4	KIA	A07
153	152	dxc4	KIA	A07
154	153	Na3	KIA	A07
155	154	b5	KIA	A07
156	155	b3	KIA	A07
157	156	cxb3	KIA	A07
158	157	Qxb3	KIA	A07
159	158	e6	KIA	A07
160	159	d3	KIA	A07
161	160	Bc5	KIA	A07
162	161	Nh4	KIA	A07
163	162	Bg4	KIA	A07
164	163	Nxb5	KIA	A07
165	164	Bxe2	KIA	A07
166	165	Ba3	KIA	A07
167	166	Bxf1	KIA	A07
168	167	Bxc5	KIA	A07
169	152	e6	KIA	A07
170	169	cxd5	KIA	A07
171	170	exd5	KIA	A07
172	171	d3	KIA	A07
173	170	cxd5	KIA	A07
174	173	Qb3	KIA	A07
175	37	g6	KIA	A07
176	36	c4	KIA	A07
177	176	dxc4	KIA	A07
178	177	O-O	KIA	A07
179	178	e6	KIA	A07
180	179	a4	KIA	A07
181	180	Nbd7	KIA	A07
182	181	Qc2	KIA	A07
183	176	e6	KIA	A07
184	183	d4	KIA	A07
185	176	g6	KIA	A07
186	185	b3	KIA	A07
187	186	Bg7	KIA	A07
188	187	Bb2	KIA	A07
189	1	c5	Zukertort Opening Sicilian Invitation	A04
190	189	c4	Zukertort Opening Sicilian Invitation	A04
191	190	Nf6	Zukertort Opening Sicilian Invitation	A04
192	191	Nc3	Zukertort Opening Sicilian Invitation	A04
193	192	e6	Zukertort Opening Sicilian Invitation	A04
194	193	g3	Zukertort Opening Sicilian Invitation	A04
195	194	d5	Zukertort Opening Sicilian Invitation	A04
196	195	cxd5	Zukertort Opening Sicilian Invitation	A04
197	196	exd5	Zukertort Opening Sicilian Invitation	A04
198	197	d4	Zukertort Opening Sicilian Invitation	A04
199	192	Nc6	Zukertort Opening Sicilian Invitation	A04
200	199	g3	Zukertort Opening Sicilian Invitation	A04
201	200	d5	Zukertort Opening Sicilian Invitation	A04
202	201	d4	Zukertort Opening Sicilian Invitation	A04
203	202	e6	Zukertort Opening Sicilian Invitation	A04
204	203	cxd5	Zukertort Opening Sicilian Invitation	A04
205	204	Nxd5	Zukertort Opening Sicilian Invitation	A04
206	205	Bg2	Zukertort Opening Sicilian Invitation	A04
207	206	cxd4	Zukertort Opening Sicilian Invitation	A04
208	207	Nxd4	Zukertort Opening Sicilian Invitation	A04
209	208	Nxc3	Zukertort Opening Sicilian Invitation	A04
210	209	bxc3	Zukertort Opening Sicilian Invitation	A04
211	210	Nxd4	Zukertort Opening Sicilian Invitation	A04
212	211	Qxd4	Zukertort Opening Sicilian Invitation	A04
213	212	Qxd4	Zukertort Opening Sicilian Invitation	A04
214	213	cxd4	Zukertort Opening Sicilian Invitation	A04
215	214	Bb4+	Zukertort Opening Sicilian Invitation	A04
216	215	Bd2	Zukertort Opening Sicilian Invitation	A04
217	216	Bxd2+	Zukertort Opening Sicilian Invitation	A04
218	217	Kxd2	Zukertort Opening Sicilian Invitation	A04
219	218	Ke7	Zukertort Opening Sicilian Invitation	A04
220	219	Rhc1	Zukertort Opening Sicilian Invitation	A04
221	206	Nxd4	Zukertort Opening Sicilian Invitation	A04
222	221	Nxd4	Zukertort Opening Sicilian Invitation	A04
223	222	Nxc3	Zukertort Opening Sicilian Invitation	A04
224	223	bxc3	Zukertort Opening Sicilian Invitation	A04
225	224	cxd4	Zukertort Opening Sicilian Invitation	A04
226	225	Qa4+	Zukertort Opening Sicilian Invitation	A04
227	226	Qd7	Zukertort Opening Sicilian Invitation	A04
228	227	Qc4	Zukertort Opening Sicilian Invitation	A04
229	228	dxc3	Zukertort Opening Sicilian Invitation	A04
230	229	O-O	Zukertort Opening Sicilian Invitation	A04
231	202	cxd4	Zukertort Opening Sicilian Invitation	A04
232	231	Nxd4	Zukertort Opening Sicilian Invitation	A04
233	232	dxc4	Zukertort Opening Sicilian Invitation	A04
234	233	Nxc6	Zukertort Opening Sicilian Invitation	A04
235	234	Qxd1+	Zukertort Opening Sicilian Invitation	A04
236	235	Nxd1	Zukertort Opening Sicilian Invitation	A04
237	236	bxc6	Zukertort Opening Sicilian Invitation	A04
238	237	Bg2	Zukertort Opening Sicilian Invitation	A04
239	238	Nd5	Zukertort Opening Sicilian Invitation	A04
240	239	Ne3	Zukertort Opening Sicilian Invitation	A04
241	240	e6	Zukertort Opening Sicilian Invitation	A04
242	241	Nxc4	Zukertort Opening Sicilian Invitation	A04
243	202	g6	Zukertort Opening Sicilian Invitation	A04
244	243	Bg2	Zukertort Opening Sicilian Invitation	A04
245	244	Bg7	Zukertort Opening Sicilian Invitation	A04
246	245	dxc5	Zukertort Opening Sicilian Invitation	A04
247	246	dxc4	Zukertort Opening Sicilian Invitation	A04
248	200	e6	Zukertort Opening Sicilian Invitation	A04
249	248	Bg2	Zukertort Opening Sicilian Invitation	A04
250	249	d5	Zukertort Opening Sicilian Invitation	A04
251	250	cxd5	Zukertort Opening Sicilian Invitation	A04
252	251	exd5	Zukertort Opening Sicilian Invitation	A04
253	252	d4	Zukertort Opening Sicilian Invitation	A04
254	192	g6	Zukertort Opening Sicilian Invitation	A04
255	254	g3	Zukertort Opening Sicilian Invitation	A04
256	255	Bg7	Zukertort Opening Sicilian Invitation	A04
257	256	d4	Zukertort Opening Sicilian Invitation	A04
258	257	cxd4	Zukertort Opening Sicilian Invitation	A04
259	258	Nxd4	Zukertort Opening Sicilian Invitation	A04
260	190	Nc6	Zukertort Opening Sicilian Invitation	A04
261	260	Nc3	Zukertort Opening Sicilian Invitation	A04
262	261	e5	Zukertort Opening Sicilian Invitation	A04
263	262	g3	Zukertort Opening Sicilian Invitation	A04
264	190	e6	Zukertort Opening Sicilian Invitation	A04
265	264	g3	Zukertort Opening Sicilian Invitation	A04
266	265	d5	Zukertort Opening Sicilian Invitation	A04
267	266	cxd5	Zukertort Opening Sicilian Invitation	A04
268	267	exd5	Zukertort Opening Sicilian Invitation	A04
269	268	d4	Zukertort Opening Sicilian Invitation	A04
270	1	e6	Zukertort Opening Sicilian Invitation	A04
271	270	g3	Zukertort Opening Sicilian Invitation	A04
272	271	d5	Zukertort Opening Sicilian Invitation	A04
273	272	Bg2	Zukertort Opening Sicilian Invitation	A04
274	273	Nf6	Zukertort Opening Sicilian Invitation	A04
275	274	O-O	Zukertort Opening Sicilian Invitation	A04
276	275	Be7	Zukertort Opening Sicilian Invitation	A04
277	276	d4	Zukertort Opening Sicilian Invitation	A04
278	277	O-O	Zukertort Opening Sicilian Invitation	A04
279	278	c4	Zukertort Opening Sicilian Invitation	A04
280	3	c6	\N	\N
281	280	Bg2	\N	\N
282	281	Nf6	\N	\N
283	282	O-O	\N	\N
284	283	Bg4	\N	\N
285	284	h3	\N	\N
286	285	Bxf3	\N	\N
287	286	Bxf3	\N	\N
288	287	e5	\N	\N
289	288	d4	\N	\N
290	289	e4	\N	\N
291	290	Bg2	\N	\N
292	291	Be7	\N	\N
293	292	c4	\N	\N
\.


--
-- TOC entry 4949 (class 0 OID 16534)
-- Dependencies: 222
-- Data for Name: pgn_games; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.pgn_games (id, opening_name, eco_code, result, pgn_data) FROM stdin;
1	Unknown Opening	A07	1-0	[Event "Live Chess"]\n[Site "Chess.com"]\n[Date "2026.03.16"]\n[Round "?"]\n[White "Whimsicoul"]\n[Black "Quietley"]\n[Result "1-0"]\n[TimeControl "600"]\n[WhiteElo "2248"]\n[BlackElo "2247"]\n[Termination "Whimsicoul won by resignation"]\n[ECO "A07"]\n[EndTime "22:33:37 GMT+0000"]\n[Link "https://www.chess.com/game/live/166041826744"]\n\n1. Nf3 d5 2. g3 Bf5 3. Bg2 Nf6 4. O-O e6 5. d4 c5 6. c4 Nc6 7. Nc3 cxd4 8. Nxd4\nNxd4 9. Qxd4 e5 1-0
\.


--
-- TOC entry 4947 (class 0 OID 16511)
-- Dependencies: 220
-- Data for Name: white_opening; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.white_opening (id, opening_name, eco_code, moves) FROM stdin;
1	KIA	A07	1.Nf3 d5 2.g3 Nf6 3.Bg2 c5 4.O-O Nc6 5.d4 cxd4 6.Nxd4 e5 7.Nxc6 bxc6 8.c4
2	KIA	A07	1.Nf3 d5 2.g3 Nf6 3.Bg2 c5 4.O-O Nc6 5.d4 e6 6.dxc5 Bxc5 7.c4
3	KIA	A07	1.Nf3 d5 2.g3 Nf6 3.Bg2 c5 4.O-O g6 5.d4 cxd4 6.Nxd4 e5 7.Nb3 Be6 8.c4
4	KIA	A07	1.Nf3 d5 2.g3 Nf6 3.Bg2 c5 4.O-O g6 5.d4 cxd4 6.Nxd4 Bg7 7.Nb3 Nc6 8.Nc3 e6 9.e4
5	KIA	A07	1.Nf3 d5 2.g3 Nf6 3.Bg2 c5 4.O-O g6 5.d4 Bg7 6.dxc5
6	KIA Yugoslav Variation	A07	1.Nf3 d5 2.g3 Nf6 3.Bg2 c6 4.O-O Bg4 5.h3 Bxf3 6.Bxf3 e5 7.d4 e4 8.Bg2 Be7 9.c4
7	KIA Yugoslav Variation	A07	1.Nf3 d5 2.g3 Nf6 3.Bg2 c6 4.O-O Bg4 5.h3 Bh5 6.c4 dxc4 7.Na3 b5 8.Ne5 Nd5 9.d3 cxd3 10.Nxd3 e6 11.Nxb5 cxb5 12.Nf4
8	KIA Yugoslav Variation	A07	1.Nf3 d5 2.g3 Nf6 3.Bg2 c6 4.O-O Bg4 5.h3 Bh5 6.c4 dxc4 7.Na3 b5 8.Ne5 Nd5 9.d3 c3 10.Qb3 b4 11.bxc3 bxa3 12.Qb7 Nd7 13.Nxd7 Qc8 14.Qxc8+ Rxc8 15.Nxf8
9	KIA Yugoslav Variation	A07	1.Nf3 d5 2.g3 Nf6 3.Bg2 c6 4.O-O Bg4 5.h3 Bh5 6.c4 dxc4 7.Na3 b5 8.Ne5 Nd5 9.d3 c3 10.Qb3 e6 11.bxc3
10	KIA Yugoslav Variation	A07	1.Nf3 d5 2.g3 Nf6 3.Bg2 c6 4.O-O Bg4 5.h3 Bh5 6.c4 e6 7.d4 Nbd7 8.cxd5 exd5 9.Nh4 Be7 10.Qb3 Qb6 11.Qe3 Bg6 12.Nxg6 hxg6
11	KIA Yugoslav Variation	A07	1.Nf3 d5 2.g3 Nf6 3.Bg2 c6 4.O-O Bg4 5.h3 Bh5 6.c4 e6 7.d4 Nbd7 8.cxd5 cxd5 9.Nc3 Be7 10.Ne5 O-O 11.g4 Bg6 12.f4 Be4 13.Nxd7
12	KIA Yugoslav Variation	A07	1.Nf3 d5 2.g3 Nf6 3.Bg2 c6 4.O-O Bg4 5.h3 Bh5 6.c4 e6 7.d4 Be7 8.Nc3 O-O 9.g4 Bg6 10.Ne5
13	KIA Yugoslav Variation	A07	1.Nf3 d5 2.g3 Nf6 3.Bg2 c6 4.O-O Bg4 5.h3 Bh5 6.c4 e6 7.d4 Be7 8.Nc3 Bxf3 9.Bxf3 dxc4 10.b3 cxb3 11.Qxb3 Qb6 12.Qd1 O-O 13.Rb1 Qa6 14.Qb3
14	KIA	A07	1.Nf3 d5 2.g3 Nf6 3.Bg2 c6 4.O-O e6 5.d4 Be7 6.Nbd2 O-O 7.Re1 Re8 8.e4 dxe4 9.Nxe4 Nxe4 10.Rxe4
15	KIA	A07	1.Nf3 d5 2.g3 Nf6 3.Bg2 c6 4.O-O e6 5.d4 Nbd7 6.Nbd2 Be7 7.Re1 O-O 8.e4 dxe4 9.Nxe4 Nxe4 10.Rxe4
16	KIA	A07	1.Nf3 d5 2.g3 Nf6 3.Bg2 c6 4.O-O e6 5.d4 Nbd7 6.Nbd2 Bd6 7.Re1 O-O 8.e4 dxe4 9.Nxe4 Nxe4 10.Rxe4
17	KIA	A07	1.Nf3 d5 2.g3 Nf6 3.Bg2 c6 4.O-O e6 5.d4 Bd6 6.Re1 O-O 7.Nbd2
18	KIA	A07	1.Nf3 d5 2.g3 Nf6 3.Bg2 c6 4.O-O Bf5 5.c4 dxc4 6.Na3 b5 7.b3 cxb3 8.Qxb3 e6 9.d3 Bc5 10.Nh4 Bg4 11.Nxb5 Bxe2 12.Ba3 Bxf1 13.Bxc5
19	KIA	A07	1.Nf3 d5 2.g3 Nf6 3.Bg2 c6 4.O-O Bf5 5.c4 e6 6.cxd5 exd5 7.d3
20	KIA	A07	1.Nf3 d5 2.g3 Nf6 3.Bg2 c6 4.O-O Bf5 5.c4 e6 6.cxd5 cxd5 7.Qb3
21	KIA	A07	1.Nf3 d5 2.g3 Nf6 3.Bg2 c6 4.O-O g6
22	KIA	A07	1.Nf3 d5 2.g3 Nf6 3.Bg2 c6 4.c4 dxc4 5.O-O e6 6.a4 Nbd7 7.Qc2
23	KIA	A07	1.Nf3 d5 2.g3 Nf6 3.Bg2 c6 4.c4 e6 5.d4
24	KIA	A07	1.Nf3 d5 2.g3 Nf6 3.Bg2 c6 4.c4 g6 5.b3 Bg7 6.Bb2
25	Zukertort Opening Sicilian Invitation	A04	1.Nf3 c5 2.c4 Nf6 3.Nc3 e6 4.g3 d5 5.cxd5 exd5 6.d4
26	Zukertort Opening Sicilian Invitation	A04	1.Nf3 c5 2.c4 Nf6 3.Nc3 Nc6 4.g3 d5 5.d4 e6 6.cxd5 Nxd5 7.Bg2 cxd4 8.Nxd4 Nxc3 9.bxc3 Nxd4 10.Qxd4 Qxd4 11.cxd4 Bb4+ 12.Bd2 Bxd2+ 13.Kxd2 Ke7 14.Rhc1
27	Zukertort Opening Sicilian Invitation	A04	1.Nf3 c5 2.c4 Nf6 3.Nc3 Nc6 4.g3 d5 5.d4 e6 6.cxd5 Nxd5 7.Bg2 Nxd4 8.Nxd4 Nxc3 9.bxc3 cxd4 10.Qa4+ Qd7 11.Qc4 dxc3 12.O-O
28	Zukertort Opening Sicilian Invitation	A04	1.Nf3 c5 2.c4 Nf6 3.Nc3 Nc6 4.g3 d5 5.d4 cxd4 6.Nxd4 dxc4 7.Nxc6 Qxd1+ 8.Nxd1 bxc6 9.Bg2 Nd5 10.Ne3 e6 11.Nxc4
29	Zukertort Opening Sicilian Invitation	A04	1.Nf3 c5 2.c4 Nf6 3.Nc3 Nc6 4.g3 d5 5.d4 g6 6.Bg2 Bg7 7.dxc5 dxc4
30	Zukertort Opening Sicilian Invitation	A04	1.Nf3 c5 2.c4 Nf6 3.Nc3 Nc6 4.g3 e6 5.Bg2 d5 6.cxd5 exd5 7.d4
31	Zukertort Opening Sicilian Invitation	A04	1.Nf3 c5 2.c4 Nf6 3.Nc3 g6 4.g3 Bg7 5.d4 cxd4 6.Nxd4
32	Zukertort Opening Sicilian Invitation	A04	1.Nf3 c5 2.c4 Nc6 3.Nc3 e5 4.g3
33	Zukertort Opening Sicilian Invitation	A04	1.Nf3 c5 2.c4 e6 3.g3 d5 4.cxd5 exd5 5.d4
34	Zukertort Opening Sicilian Invitation	A04	1.Nf3 e6 2.g3 d5 3.Bg2 Nf6 4.O-O Be7 5.d4 O-O 6.c4
35	KIA	A07	1.Nf3 d5 2.g3 Nf6 3.Bg2 c6 4.O-O Bg4 5.h3 Bxf3 6.Bxf3 e5 7.d4 e4 8.Bg2 Be7 9.c4
\.


--
-- TOC entry 4967 (class 0 OID 0)
-- Dependencies: 227
-- Name: game_deviations_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.game_deviations_id_seq', 6, true);


--
-- TOC entry 4968 (class 0 OID 0)
-- Dependencies: 225
-- Name: games_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.games_id_seq', 6, true);


--
-- TOC entry 4969 (class 0 OID 0)
-- Dependencies: 223
-- Name: opening_tree_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.opening_tree_id_seq', 293, true);


--
-- TOC entry 4970 (class 0 OID 0)
-- Dependencies: 221
-- Name: pgn_games_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.pgn_games_id_seq', 1, true);


--
-- TOC entry 4971 (class 0 OID 0)
-- Dependencies: 219
-- Name: white_opening_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.white_opening_id_seq', 35, true);


--
-- TOC entry 4796 (class 2606 OID 16653)
-- Name: game_deviations game_deviations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.game_deviations
    ADD CONSTRAINT game_deviations_pkey PRIMARY KEY (id);


--
-- TOC entry 4794 (class 2606 OID 16643)
-- Name: games games_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.games
    ADD CONSTRAINT games_pkey PRIMARY KEY (id);


--
-- TOC entry 4792 (class 2606 OID 16616)
-- Name: opening_tree opening_tree_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.opening_tree
    ADD CONSTRAINT opening_tree_pkey PRIMARY KEY (id);


--
-- TOC entry 4787 (class 2606 OID 16544)
-- Name: pgn_games pgn_games_pgn_data_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pgn_games
    ADD CONSTRAINT pgn_games_pgn_data_key UNIQUE (pgn_data);


--
-- TOC entry 4789 (class 2606 OID 16542)
-- Name: pgn_games pgn_games_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pgn_games
    ADD CONSTRAINT pgn_games_pkey PRIMARY KEY (id);


--
-- TOC entry 4785 (class 2606 OID 16519)
-- Name: white_opening white_opening_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.white_opening
    ADD CONSTRAINT white_opening_pkey PRIMARY KEY (id);


--
-- TOC entry 4790 (class 1259 OID 16617)
-- Name: idx_opening_tree_parent_move; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_opening_tree_parent_move ON public.opening_tree USING btree (parent_id, move_san);


--
-- TOC entry 4797 (class 2606 OID 16655)
-- Name: game_deviations fk_game; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.game_deviations
    ADD CONSTRAINT fk_game FOREIGN KEY (game_id) REFERENCES public.games(id);


--
-- TOC entry 4956 (class 0 OID 16673)
-- Dependencies: 229 4958
-- Name: deviation_stats; Type: MATERIALIZED VIEW DATA; Schema: public; Owner: postgres
--

REFRESH MATERIALIZED VIEW public.deviation_stats;


-- Completed on 2026-03-17 16:24:15

--
-- PostgreSQL database dump complete
--

\unrestrict bEyS8Cv76thC86XfUee7ADJxRrZghrGmMYDgJcQGOnIYN0bYCHipH5J4DkroWpM

