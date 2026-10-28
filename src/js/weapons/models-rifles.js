// The rifles' models: the hunting rifle, the SCAR 17S (traced off photos, with its AK conversion kit), the assault
// rifle and the LMG (gun-models.js puts every family together).

import { lensOn, reticleOn } from '../effects/scope-view.js';
import { box } from '../core/geometry.js';
import { T } from '../game/run-state.js';
import { fitted, GM, X } from './gun-materials.js';
import {
  apPart, apPlate, boxes, checker, clipTo, cyl, inset, irons, lathe, notchRear, portFill, profile, pullInside, pw,
  ribTube, ring, rrect, shp, solid, stipple, taper, taperX, tapeWrap, xsec, zAt
} from './gun-parts.js';
import { BOLT_KNOB } from './gun-models.js';

// the SCAR 17S's outlines, traced off a side-on photo of the FDE one (trace-photo: .claude/skills/trace-photo) at its true
// length, 953 mm with the stock out, on the assault rifle's scale (z along the gun, y up; each within half a pixel of
// the photo's edge): the upper with its handguard in one, the lower round its magwell and guard (the guard's opening
// its hole), the stock and its ribbed butt pad, the hinge, the grip and the vertical foregrip, the 10-round box, the
// two flip-up sights; the barrel and the brake turned ([r, z]) about the bore. The mag is the 17S's 20-round box; the
// 10-round one is the same box shorter, measured off the photos of the 20S with its short mag (gun-models: scar)
// a front sight's post, as thin as the real ones (a couple of millimetres: a wide one blotted out what it was put on), and
// the AR's rear aperture: the hole's radius and the thin ring's round it
const POST_W = 0.0019, AP_RING = [0.0042, 0.0052];
const SCAR = {
  y0: 1.1307, top: 1.1863, rt: 1.1933,
  up: [[0.4477, 1.1132], [0.4475, 1.1863], [1.1505, 1.1863], [1.1525, 1.1813], [1.1545, 1.1769], [1.1577, 1.1672], [1.1631, 1.1541], [1.1632, 1.112], [1.1559, 1.099], [1.1541, 1.0982], [0.9139, 1.0981], [0.7752, 1.0974], [0.7748, 1.1132]],
  lo: [[0.4497, 1.1141], [0.7745, 1.1141], [0.7741, 1.1105], [0.767, 1.1105], [0.7664, 1.0994], [0.7628, 1.0937], [0.7587, 1.0914], [0.7502, 1.0907], [0.7443, 1.0876], [0.7409, 1.0832], [0.7394, 1.0782], [0.7396, 1.0601], [0.7408, 1.054], [0.744, 1.0465], [0.7441, 1.0412], [0.7427, 1.0383], [0.7337, 1.0353], [0.6311, 1.0163], [0.6125, 1.0158], [0.5489, 1.0158], [0.5462, 1.0175], [0.5462, 1.0773], [0.4497, 1.0774]],
  guard: [[0.5631, 1.0215], [0.6145, 1.0215], [0.6204, 1.0244], [0.6247, 1.0301], [0.6247, 1.0508], [0.6232, 1.054], [0.6204, 1.0569], [0.6143, 1.0588], [0.5664, 1.0588], [0.5571, 1.0558], [0.5556, 1.0522], [0.5558, 1.0294], [0.5578, 1.0254]],
  trig: [[0.5655, 1.059], [0.5715, 1.059], [0.5712, 1.048], [0.5735, 1.035], [0.578, 1.0235], [0.5765, 1.022], [0.5705, 1.032], [0.5665, 1.045]],
  stock: [[0.1521, 0.9656], [0.1517, 1.1545], [0.1571, 1.1543], [0.2018, 1.1544], [0.2057, 1.1522], [0.2157, 1.1509], [0.2468, 1.1517], [0.2489, 1.1584], [0.2509, 1.1602], [0.2869, 1.1691], [0.3133, 1.1727], [0.3923, 1.1801], [0.4034, 1.1823], [0.4116, 1.1857], [0.417, 1.1844], [0.417, 1.0708], [0.408, 1.0733], [0.2815, 1.0725], [0.2786, 1.0762], [0.2315, 1.0762], [0.2275, 1.0741], [0.2254, 1.0717], [0.223, 1.0676], [0.224, 1.0648], [0.2228, 1.0621], [0.2196, 1.0612], [0.2173, 1.0576], [0.2185, 1.054], [0.2171, 1.0521], [0.2143, 1.0512], [0.2114, 1.0462], [0.2126, 1.0444], [0.2122, 1.0422], [0.2107, 1.0407], [0.2082, 1.0404], [0.2058, 1.0358], [0.2068, 1.034], [0.2064, 1.0316], [0.2032, 1.0305], [0.2002, 1.0261], [0.2015, 1.0222], [0.1997, 1.0201], [0.1968, 1.0194], [0.1946, 1.0154], [0.1957, 1.0136], [0.195, 1.0108], [0.1917, 1.0097], [0.1889, 1.0054], [0.19, 1.0015], [0.1882, 0.9993], [0.1853, 0.9986], [0.1832, 0.9951], [0.1843, 0.9922], [0.1835, 0.9899], [0.1796, 0.9883], [0.1757, 0.9813], [0.1699, 0.9762], [0.1613, 0.9722], [0.1543, 0.9718]],
  pad: [[0.132, 0.961], [0.1268, 0.9622], [0.1257, 0.9664], [0.126, 0.9741], [0.1281, 0.9875], [0.1261, 0.9904], [0.1284, 0.9929], [0.1268, 0.9958], [0.1291, 0.9986], [0.1274, 1.0011], [0.1291, 1.004], [0.1279, 1.0054], [0.1297, 1.009], [0.1282, 1.0115], [0.1301, 1.014], [0.1283, 1.0165], [0.1304, 1.0194], [0.1286, 1.0215], [0.1307, 1.0244], [0.1289, 1.0269], [0.1312, 1.0297], [0.1293, 1.0319], [0.1313, 1.0351], [0.1295, 1.0376], [0.1316, 1.0401], [0.1297, 1.0433], [0.1317, 1.0455], [0.1297, 1.0487], [0.132, 1.0505], [0.1298, 1.053], [0.1317, 1.0558], [0.1299, 1.0583], [0.132, 1.0612], [0.1299, 1.0637], [0.1319, 1.0662], [0.1296, 1.0694], [0.1317, 1.0715], [0.1295, 1.0744], [0.1316, 1.0769], [0.1293, 1.0798], [0.1315, 1.0823], [0.1292, 1.0848], [0.1311, 1.0876], [0.1287, 1.0898], [0.1308, 1.0926], [0.1285, 1.0948], [0.1306, 1.0976], [0.128, 1.1001], [0.1301, 1.103], [0.1274, 1.1055], [0.1295, 1.1079], [0.1271, 1.1105], [0.1292, 1.113], [0.1265, 1.1159], [0.1285, 1.1191], [0.1258, 1.1209], [0.1279, 1.1234], [0.1253, 1.1259], [0.127, 1.129], [0.1246, 1.1309], [0.1265, 1.1341], [0.1236, 1.1541], [0.1245, 1.159], [0.1263, 1.1607], [0.1292, 1.1614], [0.1485, 1.1584], [0.1528, 1.1534], [0.1576, 1.1523], [0.1576, 0.9725], [0.1542, 0.9717], [0.1528, 0.9665], [0.1497, 0.9643]],
  hinge: [[0.4098, 1.0737], [0.4098, 1.1845], [0.4152, 1.1842], [0.4249, 1.1845], [0.4306, 1.19], [0.4527, 1.1901], [0.4528, 1.0737]],
  grip: [[0.5149, 0.9313], [0.5035, 0.932], [0.4749, 0.9362], [0.4531, 0.9398], [0.4484, 0.9422], [0.4484, 0.9466], [0.45, 0.9504], [0.452, 0.9609], [0.4597, 0.9836], [0.4734, 1.014], [0.4846, 1.0312], [0.4874, 1.0397], [0.4874, 1.0501], [0.4867, 1.0548], [0.4831, 1.0635], [0.4789, 1.069], [0.474, 1.0737], [0.474, 1.0799], [0.5494, 1.0799], [0.5494, 1.0165], [0.5407, 1.0147], [0.5369, 1.0126], [0.5328, 1.0077], [0.5307, 1.0031], [0.5261, 0.9811], [0.524, 0.9736], [0.5155, 0.9428], [0.5157, 0.9368], [0.5175, 0.9353], [0.5162, 0.9321]],
  gripPanel: [[0.4837, 1.0192], [0.5122, 1.0177], [0.5108, 0.9477], [0.4658, 0.9405], [0.4586, 0.9691]],
  fore: [[0.9979, 0.9985], [0.9933, 0.9993], [0.991, 1.0008], [0.9903, 1.0043], [0.9966, 1.0783], [0.9943, 1.0863], [0.9895, 1.0923], [0.989, 1.0985], [1.0571, 1.0985], [1.0571, 1.0873], [1.054, 1.0793], [1.0518, 1.0572], [1.0475, 1.0011], [1.0447, 0.9993], [1.0394, 0.9986]],
  forePanel: [[1.0, 1.0589], [1.04, 1.0589], [1.0428, 1.0067], [1.004, 1.0067]],
  mag: [[0.6305, 1.09], [0.7335, 1.09], [0.7329, 0.9432], [0.7317, 0.9386], [0.7322, 0.9318], [0.7318, 0.9239], [0.734, 0.9207], [0.7342, 0.9164], [0.7301, 0.9142], [0.7241, 0.9134], [0.6833, 0.9117], [0.6518, 0.9122], [0.6365, 0.9134], [0.6343, 0.9142], [0.6347, 0.9218], [0.6315, 0.9224], [0.6292, 0.926]],
  rear: [[0.4704, 1.187], [0.5135, 1.187], [0.5135, 1.1883], [0.5095, 1.1888], [0.5099, 1.1924], [0.5082, 1.196], [0.5024, 1.2022], [0.4912, 1.2038], [0.4913, 1.236], [0.4905, 1.2417], [0.4881, 1.2452], [0.4799, 1.2457], [0.4791, 1.2403], [0.4798, 1.2274], [0.4792, 1.2035], [0.4768, 1.1981], [0.478, 1.1949], [0.4774, 1.1895], [0.4704, 1.1889]],
  front: [[1.1053, 1.187], [1.1502, 1.187], [1.1485, 1.1917], [1.1448, 1.1929], [1.144, 1.1963], [1.1376, 1.2031], [1.1382, 1.2156], [1.1395, 1.2246], [1.1379, 1.2296], [1.1375, 1.2392], [1.1355, 1.2409], [1.1255, 1.2414], [1.1247, 1.2389], [1.1247, 1.2263], [1.1275, 1.2238], [1.1275, 1.2196], [1.1289, 1.2138], [1.1283, 1.2078], [1.1302, 1.2049], [1.1269, 1.2035], [1.1255, 1.1983], [1.1113, 1.1985], [1.1088, 1.1949], [1.1088, 1.1902], [1.1055, 1.1888]],
  barrel: [[0.0001, 0.76], [0.0107, 0.76], [0.0107, 1.248], [0.012, 1.253], [0.0121, 1.263]],
  brake: [[0.0121, 1.263], [0.0135, 1.2644], [0.0141, 1.2666], [0.0137, 1.268], [0.0141, 1.2823], [0.0135, 1.2837], [0.0141, 1.2852], [0.0135, 1.2866], [0.0141, 1.288], [0.0135, 1.2894], [0.0141, 1.2909], [0.0137, 1.3045], [0.0138, 1.3466], [0.0136, 1.3481], [0.0127, 1.3488], [0.0137, 1.3495], [0.0137, 1.3545], [0.0135, 1.3552], [0.0122, 1.3559], [0.0077, 1.3567], [0.0001, 1.3567]],
  ports: [[1.301, 1.324], [1.327, 1.3467]],   // the brake's two side ports (z), open right through
  mlok: [0.8533, 0.8933, 0.9055, 0.9463, 0.9555, 0.997, 1.0084, 1.0499, 1.0607, 1.1021, 1.1129, 1.1544]   // the handguard's slots, each a z0, z1
};
// the battle rifle with its AK conversion kit (akkit, weapons/gun-mods.js). The lower, off the side-on render of the HANDL
// kit on a SCAR, scaled to the traced SCAR by its trigger guard (trace-photo: .claude/skills/trace-photo): the same guard
// and grip, and in front of the guard the AK magwell's rounded mouth, an arc (arc) sweeping up and forward from the
// guard's front to meet the upper, with a raised rim round it (rim, how far up it reaches), the mag going up into it.
// The mag: a 30-round polymer AK mag traced off a side-on photo (scaled to its 66 mm depth, the 7.62x39 round's length
// and its walls; within a pixel of the photo's edge, its ribbed spine and all), turned tilt degrees forward of the
// photo's upright and set where the render has it, its top up in the well; its waffle (the crossbars and the two lines
// down it, laid out off the photo's grid between its traced edges: ribs) and the seam over its floor plate (seam)
const AKM_KIT = {
  arc: [[0.637, 1.0275], [0.6448, 1.0373], [0.6507, 1.0431], [0.6605, 1.051], [0.6702, 1.0588], [0.6839, 1.0666], [0.6996, 1.0764], [0.7152, 1.0842], [0.729, 1.0901], [0.7427, 1.094], [0.7544, 1.0979], [0.77, 1.1018]], rim: 0.011,
  lo: [[0.4497, 1.1141], [0.7745, 1.1141], [0.7745, 1.104], [0.77, 1.1018], [0.7544, 1.0979], [0.7427, 1.094], [0.729, 1.0901], [0.7152, 1.0842], [0.6996, 1.0764], [0.6839, 1.0666], [0.6702, 1.0588], [0.6605, 1.051], [0.6507, 1.0431], [0.6448, 1.0373], [0.637, 1.0275], [0.6315, 1.022], [0.6311, 1.0163], [0.6125, 1.0158], [0.5489, 1.0158], [0.5462, 1.0175], [0.5462, 1.0773], [0.4497, 1.0774]],
  tilt: 28,
  mag: [[0.7861, 0.8497], [0.7889, 0.8515], [0.7912, 0.8543], [0.821, 0.8962], [0.8236, 0.9005], [0.8323, 0.9125], [0.8337, 0.9155], [0.8343, 0.9184], [0.831, 0.9214], [0.8277, 0.9239], [0.8252, 0.9243], [0.8231, 0.9257], [0.8212, 0.9261], [0.8194, 0.9272], [0.8181, 0.9285], [0.8171, 0.9305], [0.8145, 0.9327], [0.8124, 0.9333], [0.8111, 0.9343], [0.8095, 0.9359], [0.8086, 0.9377], [0.8064, 0.9401], [0.8037, 0.9413], [0.8012, 0.9436], [0.8004, 0.9458], [0.7982, 0.948], [0.7947, 0.9504], [0.7931, 0.9521], [0.7921, 0.9546], [0.7901, 0.9568], [0.7882, 0.9577], [0.7872, 0.9586], [0.7856, 0.9608], [0.7849, 0.963], [0.7832, 0.9652], [0.781, 0.9665], [0.7791, 0.9687], [0.7777, 0.9722], [0.7756, 0.975], [0.7735, 0.9766], [0.7718, 0.9791], [0.7716, 0.9808], [0.77, 0.9835], [0.769, 0.9848], [0.7677, 0.9854], [0.7657, 0.9885], [0.7654, 0.9907], [0.7636, 0.994], [0.7618, 0.9953], [0.7608, 0.9967], [0.7599, 0.9988], [0.7593, 1.0016], [0.7578, 1.0044], [0.7562, 1.0056], [0.7551, 1.0078], [0.7546, 1.011], [0.7531, 1.0143], [0.7513, 1.0159], [0.7503, 1.018], [0.75, 1.0195], [0.7501, 1.021], [0.7493, 1.0231], [0.7484, 1.0251], [0.7469, 1.0266], [0.746, 1.0291], [0.7459, 1.0316], [0.7449, 1.0351], [0.7429, 1.0377], [0.7422, 1.0406], [0.7423, 1.0427], [0.7415, 1.0456], [0.7395, 1.0489], [0.7391, 1.0508], [0.7394, 1.0525], [0.739, 1.0551], [0.7383, 1.0574], [0.737, 1.0593], [0.7365, 1.0613], [0.7369, 1.0642], [0.7363, 1.0671], [0.7346, 1.071], [0.7344, 1.0726], [0.735, 1.0738], [0.7347, 1.0761], [0.7351, 1.0769], [0.7329, 1.0828], [0.7322, 1.0875], [0.7309, 1.0908], [0.7312, 1.0943], [0.7315, 1.094], [0.732, 1.0948], [0.7328, 1.0944], [0.7342, 1.0954], [0.7326, 1.0969], [0.7325, 1.1002], [0.733, 1.1024], [0.7326, 1.103], [0.651, 1.0596], [0.657, 1.043], [0.6591, 1.0346], [0.6607, 1.0323], [0.6616, 1.0288], [0.6612, 1.0261], [0.6623, 1.0225], [0.6639, 1.0207], [0.6648, 1.0185], [0.6651, 1.0168], [0.6648, 1.0145], [0.6652, 1.0129], [0.6663, 1.0102], [0.6676, 1.009], [0.6684, 1.0074], [0.6691, 1.0052], [0.6689, 1.0027], [0.6703, 0.9989], [0.6723, 0.9967], [0.6736, 0.9935], [0.6736, 0.9903], [0.6751, 0.987], [0.6772, 0.985], [0.6785, 0.982], [0.6784, 0.9796], [0.68, 0.9758], [0.6807, 0.9749], [0.6822, 0.9738], [0.6839, 0.9705], [0.684, 0.968], [0.6855, 0.9648], [0.6863, 0.9636], [0.6877, 0.9627], [0.6885, 0.9617], [0.6899, 0.959], [0.69, 0.9564], [0.6921, 0.9529], [0.694, 0.9517], [0.6953, 0.9498], [0.6963, 0.948], [0.6962, 0.946], [0.6979, 0.943], [0.6989, 0.9418], [0.701, 0.9404], [0.7029, 0.9375], [0.703, 0.9353], [0.7042, 0.9333], [0.7058, 0.9311], [0.7073, 0.9306], [0.7082, 0.9296], [0.7101, 0.9268], [0.7105, 0.9243], [0.713, 0.921], [0.7151, 0.92], [0.7165, 0.9182], [0.7176, 0.9165], [0.7179, 0.9145], [0.7194, 0.9126], [0.7209, 0.9108], [0.7229, 0.9101], [0.7246, 0.9081], [0.7256, 0.9066], [0.7259, 0.9048], [0.7285, 0.9016], [0.7293, 0.9009], [0.7309, 0.9005], [0.7333, 0.8981], [0.734, 0.897], [0.7343, 0.8952], [0.7353, 0.894], [0.7377, 0.8916], [0.7397, 0.891], [0.742, 0.8888], [0.7433, 0.8858], [0.746, 0.8829], [0.7487, 0.882], [0.7509, 0.88], [0.7518, 0.8789], [0.7523, 0.8771], [0.7547, 0.8748], [0.7559, 0.8737], [0.7581, 0.8732], [0.7604, 0.8712], [0.7612, 0.8703], [0.7618, 0.8686], [0.7632, 0.8672], [0.7651, 0.8656], [0.7675, 0.8651], [0.7686, 0.8643], [0.7709, 0.8622], [0.7715, 0.8605], [0.7726, 0.8595], [0.7752, 0.8575], [0.7774, 0.8572], [0.7786, 0.8564], [0.7805, 0.8549], [0.7818, 0.8527], [0.7833, 0.8523], [0.7834, 0.8513]],
  ribs: [[0.6628, 1.0437, 0.7281, 1.0784], [0.6676, 1.0254, 0.7313, 1.0593], [0.6744, 1.0082, 0.7366, 1.0413], [0.6801, 0.9904, 0.742, 1.0233], [0.6888, 0.9742, 0.7496, 1.0065], [0.6964, 0.9574, 0.7587, 0.9905], [0.707, 0.9421, 0.7677, 0.9744], [0.7164, 0.9263, 0.7797, 0.96], [0.7289, 0.9121, 0.7921, 0.9457], [0.7402, 0.8973, 0.8054, 0.9319], [0.7547, 0.8842, 0.8231, 0.9205], [0.7053, 1.0663, 0.7091, 1.0475], [0.7091, 1.0475, 0.715, 1.0298], [0.715, 1.0298, 0.7205, 1.0119], [0.7205, 1.0119, 0.7285, 0.9952], [0.7285, 0.9952, 0.737, 0.9789], [0.737, 0.9789, 0.7466, 0.9632], [0.7466, 0.9632, 0.7576, 0.9482], [0.7576, 0.9482, 0.7701, 0.934], [0.7701, 0.934, 0.7826, 0.9199], [0.7826, 0.9199, 0.7992, 0.9078], [0.6803, 1.053, 0.6846, 1.0344], [0.6846, 1.0344, 0.6909, 1.017], [0.6909, 1.017, 0.6966, 0.9991], [0.6966, 0.9991, 0.7049, 0.9827], [0.7049, 0.9827, 0.7129, 0.9662], [0.7129, 0.9662, 0.7231, 0.9507], [0.7231, 0.9507, 0.7332, 0.9353], [0.7332, 0.9353, 0.7457, 0.9211], [0.7457, 0.9211, 0.7576, 0.9066], [0.7576, 0.9066, 0.7731, 0.8939]],
  seam: [0.7478, 0.8839, 0.8228, 0.9238]
};

// where the hunting rifle's scope rings clamp onto its rail (z: the plain scope's and the big one's): both on the
// receiver ahead of the ejection port and the bolt in it, between the scope's eyepiece and its objective bell
const SCOPE_RINGS = { std: [0.742, 0.855], big: [0.738, 0.885] };
export const RIFLE_MODELS = {
  // hunting rifle: a Winchester Model 70, traced off a side-on photo. A one-piece walnut stock (a straight comb, a
  // pistol grip and a long slim forend, checkered at the grip and forend, swivels under the butt and forend, a black
  // pad); a round receiver with the ejection port on the shooter's right, the bolt showing in it; a slim barrel tapering
  // to a hooded front sight on its ramp, a notch rear sight on the receiver ring; the guard loop and its floorplate.
  // The bolt handle sweeps out and down to its knob, the way a Model 70's does
  hunting(g, m) {
    const W = GM.walnut, B = GM.blued, sight = T('sight');
    // ---- stock (traced off the photo: the straight comb, the wrist rising into the tang, the pistol grip, the long
    // forend), slimmer through the wrist and toward the tip; the black pad; checkering on the grip and the forend, cut
    // to the stock's own outline; the swivels
    const sg = new THREE.Group(); g.add(sg);
    const SO = [[0.1765, 1.1093], [0.1935, 1.1088], [0.2259, 1.1176], [0.4095, 1.1161], [0.419, 1.1131], [0.4325, 1.1025], [0.4404, 1.1], [0.452, 1.1], [0.536, 1.1262], [0.57, 1.128], [0.6, 1.129], [0.728, 1.129], [0.745, 1.134], [1.03, 1.132], [1.056, 1.13], [1.0724, 1.1213], [1.0705, 1.1093], [1.0617, 1.1027], [0.9993, 1.0975], [0.8713, 1.0926], [0.8178, 1.0897], [0.7598, 1.0838], [0.7431, 1.0814], [0.7362, 1.078], [0.6048, 1.0691], [0.5974, 1.0663], [0.5527, 1.0662], [0.528, 1.0688], [0.5124, 1.0694], [0.4932, 1.0633], [0.4766, 1.0534], [0.468, 1.0437], [0.4487, 1.0116], [0.415, 1.0167], [0.4007, 1.0237], [0.395, 1.0334], [0.3833, 1.0336], [0.2543, 0.9945], [0.2297, 0.9868], [0.171, 0.9683]];
    solid(sg, SO, 0.05, W, X, 0.01);
    solid(sg, [[0.1396, 1.0607], [0.1404, 1.1003], [0.1434, 1.1076], [0.147, 1.1099], [0.1775, 1.1093], [0.172, 0.9683], [0.1491, 0.9614], [0.1441, 0.9631], [0.1426, 0.969]], 0.052, GM.rubber, X, 0.006);
    checker(sg, clipTo(inset(SO, 0.0115), [[0.438, 1.03], [0.452, 1.018], [0.47, 1.045], [0.5, 1.07], [0.533, 1.105], [0.533, 1.13], [0.5, 1.115], [0.462, 1.1], [0.44, 1.07]]), 0.025, 0.0034, 0.52);
    checker(sg, clipTo(inset(SO, 0.0115), [[0.78, 1.0], [0.985, 1.0], [0.985, 1.118], [0.79, 1.112]]), 0.025, 0.0034, 0.52);
    taperX(sg, pw([[0.3, 1], [0.44, 0.8], [0.55, 0.8], [0.65, 0.88], [0.95, 0.88], [1.07, 0.76]]));
    [[0.25, 0.996], [1.0, 1.1]].forEach(([z, yy]) => { box(g, 0.008, 0.008, 0.012, GM.metal2, X, yy + 0.003, z); const t = new THREE.Mesh(new THREE.TorusGeometry(0.0075, 0.002, 6, 10), GM.metal2); t.rotation.y = Math.PI / 2; t.position.set(X, yy - 0.007, z); g.add(t); });
    // ---- receiver: round, its ring in front, the port on the right (cut through, filled behind on the left), the
    // tang behind (the port and the bolt set back a little, so the action sits over the magazine, right ahead of the
    // guard); recoil lug and floorplate underneath
    profile(g, shp([[0.575, 1.124], [0.575, 1.14], [0.6, 1.143], [0.762, 1.14], [0.768, 1.148], [0.86, 1.148], [0.866, 1.152], [0.892, 1.152], [0.9, 1.146], [0.928, 1.145], [0.928, 1.124], [0.827, 1.124], [0.8, 1.128], [0.77, 1.124]], [rrect(0.613, 1.13, 0.717, 1.149, 0.004)]), 0.027, B, X, 0.0025);
    portFill(g, 0.613, 1.13, 0.717, 1.149, 0.027, 0.0025, B);
    box(g, 0.02, 0.008, 0.08, B, X, 1.122, 0.6);
    // ---- the guard: an oval loop traced off the photo, its top up in the stock (the floorplate ahead of it lies flush
    // in the stock's belly), the trigger near its back
    profile(g, shp(inset([[0.531, 1.07], [0.5308, 1.0613], [0.5335, 1.044], [0.5357, 1.0415], [0.5389, 1.0385], [0.5443, 1.0357], [0.5477, 1.0335], [0.5703, 1.0335], [0.5803, 1.0361], [0.586, 1.0399], [0.59, 1.0459], [0.5911, 1.0507], [0.5918, 1.06], [0.5925, 1.07]], 0.0012),
      [shp(inset([[0.5373, 1.0665], [0.5378, 1.0473], [0.542, 1.0419], [0.5478, 1.0399], [0.5535, 1.0394], [0.5611, 1.0392], [0.579, 1.0419], [0.5857, 1.048], [0.5854, 1.0624], [0.585, 1.0665]], -0.0012))]), 0.011, B, X, 0.0012);
    profile(g, shp([[0.5442, 1.068], [0.5502, 1.068], [0.5499, 1.0601], [0.5495, 1.0506], [0.5518, 1.048], [0.5527, 1.0447], [0.5522, 1.0433], [0.5486, 1.0428], [0.5476, 1.0456], [0.5451, 1.0479], [0.5442, 1.063]]), 0.006, GM.metal2, X, 0.0008);
    // ---- the magazine, by its mag step: the fixed one's floorplate flush in the stock's belly; a deeper floorplate
    // let down under it (Mag extension, 7 rounds); or a detachable 10-round box, after the polymer AICS-pattern kits: a
    // bottom-metal plate from the guard forward round the well, the release paddle inside the front of the guard, and the
    // box itself right up against the guard, under the port in line with the bolt and chamber; straight
    // fronted with its sides stepped and ribbed and a flared base plate (in the magazine group, so a reload drops it out and
    // brings a fresh one in: weapons/build-weapons.js, player/hold.js)
    const mt = T('mag'), mg = g.userData.magG || g;
    if (mt === 1) {
      profile(g, shp([[0.597, 1.0712], [0.744, 1.0805], [0.744, 1.0655], [0.737, 1.0592], [0.606, 1.0545], [0.597, 1.0592]]), 0.031, B, X, 0.002);
      box(g, 0.004, 0.004, 0.006, GM.metal2, X, 1.057, 0.735);   // its catch
    } else if (mt >= 2) {
      profile(g, shp([[0.5915, 1.0705], [0.702, 1.0775], [0.702, 1.066], [0.5915, 1.061]]), 0.034, B, X, 0.0015);   // the bottom metal
      profile(g, shp([[0.5835, 1.066], [0.589, 1.066], [0.5885, 1.05], [0.5855, 1.047], [0.5825, 1.05]]), 0.01, B, X, 0.0008);    // the release paddle, inside the front of the guard
      const MB = [[0.596, 1.1], [0.679, 1.1], [0.679, 1.002], [0.687, 0.994], [0.687, 0.982], [0.596, 0.982]];   // from the guard's front edge, under the port, where the bolt strips its rounds
      profile(mg, shp(MB), 0.03, GM.poly, X, 0.0018);
      profile(mg, shp([[0.5965, 0.982], [0.6885, 0.982], [0.6885, 0.993], [0.681, 0.997], [0.5965, 0.997]]), 0.0355, GM.poly, X, 0.002);   // the base plate, flared out
      [1.044, 1.024, 1.006].forEach(y => box(mg, 0.0362, 0.0035, 0.079, GM.poly, X, y, 0.6375));   // the steps down its sides
      [-1, 1].forEach(sd => { box(mg, 0.0015, 0.03, 0.034, GM.rubber, X + sd * 0.0174, 1.025, 0.618); box(mg, 0.0015, 0.03, 0.034, GM.rubber, X + sd * 0.0174, 1.025, 0.657); });   // the panels recessed in its sides
    }
    // ---- barrel, tapering to the muzzle, and its sights
    taper(g, 0.0118, 0.0078, 0.552, B, X, 1.14, 1.204);
    profile(g, shp([[1.39, 1.144], [1.415, 1.149], [1.468, 1.151], [1.468, 1.144]]), 0.012, B, X, 0.001);
    if (sight < 3) {   // iron sights till a scope goes on
      profile(g, shp([[1.42, 1.15], [1.452, 1.15], [1.452, 1.153], [1.42, 1.153]]), 0.024, B, X, 0);
      { const hood = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.036, 16, 1, true, -Math.PI / 2, Math.PI), B); hood.rotation.x = Math.PI / 2; hood.position.set(X, 1.155, 1.44); g.add(hood); hood.material.side = THREE.DoubleSide; }
      box(g, POST_W, 0.012, 0.004, GM.steel, X, 1.157, 1.436);
      // the notch rear sight on the barrel, its blade level with the post's tip (taken off for the rail once a red dot
      // or a holo goes on: that's what you aim with then)
      // (your eye where your cheek is on the comb, well back from the notch out on the barrel: relief)
      if (!sight) { notchRear(g, X, 1.163, 0.9, 0.02, 0.012, 0.008, 0.0042, 0.004, B); irons(g, { kind: 'notch', yr: 1.163, rz: 0.9, yf: 1.163, fz: 1.436, relief: 0.46 }); }
    }
    // ---- the bolt: a polished body in the receiver, the shroud and its safety out the back, the handle out to the
    // right and down to its knob (at BOLT_KNOB). It turns about the bore and runs back and forward (player/hold.js)
    const bh = new THREE.Group(); bh.position.set(X, 1.14, 0.565); g.add(bh);
    cyl(bh, 0.0115, 0.17, GM.steel, 0, 0, 0.075, 16);
    lathe(bh, [[0.001, -0.052], [0.0105, -0.05], [0.014, -0.04], [0.0145, -0.012], [0.012, 0.0]], B, 0, 0, 18);
    box(bh, 0.005, 0.01, 0.016, GM.steel, 0, 0.015, -0.032);
    { const arm = box(bh, 0.009, 0.06, 0.012, m.bolt ? GM.steel : GM.metal2, -0.03, -0.025, -0.004); arm.rotation.z = -0.87; }
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.0115, 10, 8), m.bolt ? GM.steel : GM.metal2); knob.scale.set(1, 0.95, 1.25); knob.position.set(BOLT_KNOB[0], BOLT_KNOB[1], BOLT_KNOB[2]); knob.castShadow = true; bh.add(knob);
    // ---- any optic off the bench goes on a one-piece picatinny base along the receiver, stepped down over its lower
    // rear bridge, as on the other guns: the plain scope or the big high-power one in picatinny rings clamped to it, the
    // red dot, the holo and the ACOG straight on it (weapons/attachments.js puts those on). The rings sit on the
    // receiver's front, ahead of the port, never over the bolt (SCOPE_RINGS)
    const big = sight >= 5, scope = sight === 3 || big;
    let top = 1.152;
    if (sight) fitted(g, () => {
      const z0 = 0.63, z1 = 0.915, b0 = 1.156, RT = b0 + 0.0105;
      profile(g, shp([[z0, 1.1405], [0.762, 1.1405], [0.768, 1.1478], [z1, 1.1478], [z1, b0 + 0.001], [z0, b0 + 0.001]]), 0.022, B, X, 0.0008);
      xsec(g, shp([[X - 0.0125, b0], [X + 0.0125, b0], [X + 0.0168, b0 + 0.003], [X + 0.0168, b0 + 0.005], [X + 0.0148, RT], [X - 0.0148, RT], [X - 0.0168, b0 + 0.005], [X - 0.0168, b0 + 0.003]]), z0, z1, GM.rail, 0.0006);
      for (let z = z0 + 0.012; z < z1 - 0.008; z += 0.0172) box(g, 0.0338, 0.0034, 0.0065, GM.rubber, X, RT - 0.0015, z);   // its cross slots
      top = RT;
    });
    if (scope) {
      const sr = big ? 0.0215 : 0.019, sy = big ? 1.212 : 1.198, ob = big ? 0.036 : 0.03, oc = big ? 0.026 : 0.024, z0 = big ? 0.6 : 0.63, z1 = big ? 0.97 : 0.93;
      cyl(g, sr, z1 - z0 - 0.12, GM.metal, X, sy, (z0 + z1) / 2, 20);
      lathe(g, [[sr, z1 - 0.062], [sr * 1.15, z1 - 0.045], [ob, z1 - 0.012], [ob, z1], [ob * 0.86, z1 + 0.002]], GM.metal, X, sy, 24);   // objective bell
      lathe(g, [[oc * 0.94, z0 - 0.004], [oc, z0 - 0.001], [oc, z0 + 0.03], [sr * 1.1, z0 + 0.058], [sr, z0 + 0.062]], GM.metal, X, sy, 24);   // eyepiece
      cyl(g, ob * 0.86, 0.003, GM.glass, X, sy, z1 + 0.002, 20); cyl(g, oc * 0.94, 0.003, GM.glass, X, sy, z0 - 0.0035, 20);
      { const tt = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.016, 12), GM.metal2); tt.position.set(X, sy + sr + 0.007, (z0 + z1) / 2); g.add(tt);
        const st = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.016, 12), GM.metal2); st.rotation.z = Math.PI / 2; st.position.set(X + sr + 0.007, sy, (z0 + z1) / 2); g.add(st); }
      // each ring: its clamp on the rail (the cross-bolt through it, its nut out on the right), a short neck up to the
      // ring round the tube, and the cap's screws either side
      (big ? SCOPE_RINGS.big : SCOPE_RINGS.std).forEach(z => {
        box(g, 0.0345, 0.007, 0.016, B, X, top + 0.0035, z);
        cyl(g, 0.0032, 0.04, GM.metal2, X, top + 0.0015, z, 10).rotation.set(0, 0, Math.PI / 2);
        box(g, 0.006, 0.008, 0.008, GM.metal2, X - 0.021, top + 0.0015, z);
        box(g, 0.02, sy - sr - top - 0.005, 0.014, B, X, (sy - sr + top + 0.007) / 2, z);
        ring(g, sr + 0.0045, 0.016, B, X, sy, z);
        [-1, 1].forEach(sd => box(g, 0.006, 0.006, 0.012, B, X + sd * (sr + 0.006), sy, z));
      });
      // a rubber eyecup on the eyepiece: from your eye, a dark shell round the scope's picture (as an ACOG's body is),
      // with your eye far enough back to see it (relief), not a picture floating with nothing round it
      // (a solid ring, its inside wall back down to the eyepiece: an open shell showed only its far side from behind, a
      // loose ring standing off the tube with a gap round it)
      lathe(g, [[oc * 0.94, z0 - 0.016], [oc * 1.32, z0 - 0.016], [oc * 1.38, z0 - 0.012], [oc * 1.3, z0 + 0.004], [oc, z0 + 0.01], [oc * 0.94, z0 + 0.01], [oc * 0.94, z0 - 0.016]], GM.rubber, X, sy, 24);
      g.userData.optic = { kind: 'scope', x: X, y: sy, zr: z0 - 0.004, zf: z1 + 0.002, r: oc * 0.94, relief: 0.11 };   // (looked down in first person: game/view-cam.js)
      lensOn(g, X, sy, z0 - 0.0052, oc * 0.94);   // (the eyepiece's glass you look into: effects/scope-view.js)
    }
    return { front: 1.48, y: 1.14, noSight: scope, top, sz: 0.76, slide: bh, travel: 0.13, cyc: true, ...(mt >= 2 ? { magZ: 0.641, magY: 1.07, ownMags: true } : {}) };
  },
  // battle rifle: the FN SCAR 17S in flat dark earth, its outlines traced off a side-on photo (SCAR, above) and checked
  // against the three-quarter ones. The aluminium upper and its handguard in one piece, the ejection port cut through
  // its right side (the bolt carrier in it runs back on each shot); the long top rail and its cross slots, the M-LOK
  // slots down both sides of the handguard, the QD mounts, the charging handle in its slot on the right and the brass
  // deflector; the polymer lower round its magwell and guard, the trigger, the selector, the bolt release and the mag
  // release paddle; the folding stock on its hinge and its ribbed rubber pad; the grip and the vertical foregrip with
  // their stippled panels; the pencil barrel and the two-port brake (gone under a can); the flip-up sights, standing till
  // an optic goes on the rail, then folded flat. The magazine: the short 10-round box, or the 20 (MAG_UP, game/run-state.js)
  scar(g, m) {
    const { y0, top: UT, rt: RT } = SCAR, mt = T('mag'), sight = T('sight'), mg = g.userData.magG || g, ak = !!m.akkit, LO = ak ? AKM_KIT.lo : SCAR.lo;
    const U = GM.fde, P = GM.fdeP, G = GM.fdeG, K = GM.poly, W = 0.058, R = X - W / 2;   // (R: its right-hand face)
    // ---- the upper: the port through it on the right (plugged on the left, a dark wall down the middle), the bolt
    // carrier showing in it; the rail and its slots; the handguard's slots, both sides
    const PT = [0.639, 1.1211, 0.737, 1.1397];
    solid(g, SCAR.up, W, U, X, 0.003, [rrect(PT[0] - 0.003, PT[1] - 0.003, PT[2] + 0.003, PT[3] + 0.003, 0.005)]);
    portFill(g, PT[0], PT[1], PT[2], PT[3], W - 0.006, 0.003, U);
    const bc = box(g, 0.022, 0.017, 0.094, GM.steelDk, X - 0.013, (PT[1] + PT[3]) / 2, (PT[0] + PT[2]) / 2);
    xsec(g, shp([[X - 0.0125, UT - 0.001], [X + 0.0125, UT - 0.001], [X + 0.0168, UT + 0.002], [X + 0.0168, UT + 0.0035], [X + 0.0148, RT], [X - 0.0148, RT], [X - 0.0168, UT + 0.0035], [X - 0.0168, UT + 0.002]]), 0.428, 1.152, U, 0.0006);
    { const B = []; for (let z = 0.4365; z < 1.146; z += 0.0129) B.push([0.0338, 0.0034, 0.0055, X, RT - 0.0015, z]); boxes(g, B, GM.rubber); }
    { const B = [], M = SCAR.mlok; for (let i = 0; i < M.length; i += 2) [-1, 1].forEach(sd => B.push([0.0012, 0.0071, M[i + 1] - M[i], X + sd * W / 2, 1.1246, (M[i] + M[i + 1]) / 2], [0.0012, 0.0057, M[i + 1] - M[i] - 0.006, X + sd * W / 2, 1.1067, (M[i] + M[i + 1]) / 2])); boxes(g, B, GM.rubber); }
    { const rr2 = (...a) => shp(rrect(...a).getPoints().map(p => [p.x, p.y])); [-1, 1].forEach(sd => { profile(g, rr2(0.7446, 1.1215, 0.8125, 1.1385, 0.008), 0.004, K, X + sd * (W / 2 + 0.0015), 0.001); profile(g, rr2(1.102, 1.1607, 1.154, 1.1801, 0.009), 0.004, K, X + sd * (W / 2 + 0.0015), 0.001); }); }   // the QD mounts
    profile(g, shp([[0.581, 1.1225], [0.636, 1.1225], [0.639, 1.14], [0.603, 1.1445], [0.585, 1.14]]), 0.006, K, R - 0.002, 0.001);   // the brass deflector
    // the charging handle's slot, and its knob out to the right (its own group: the reload draws it back)
    box(g, 0.0012, 0.0086, 0.193, GM.rubber, R, 1.1681, 0.7195);
    const ch = new THREE.Group(); g.add(ch);
    cyl(ch, 0.0075, 0.02, K, R - 0.009, 1.1681, 0.811, 14).rotation.set(0, 0, Math.PI / 2); box(ch, 0.008, 0.007, 0.012, K, R - 0.002, 1.1681, 0.811);
    // ---- the lower: the guard (narrow, its opening traced), the body and the wider magwell over it; the trigger,
    // the selector (both sides), the bolt release and the mag release paddle
    // (with the AK kit, its lower: AKM_KIT)
    solid(g, LO, 0.03, P, X, 0.002, [shp(inset(SCAR.guard, -0.002))]);
    solid(g, clipTo(LO, [[0.44, 1.062], [0.78, 1.062], [0.78, 1.12], [0.44, 1.12]]), 0.052, P, X, 0.004);
    solid(g, clipTo(LO, [[0.632, 1.0], [0.78, 1.0], [0.78, 1.12], [0.632, 1.12]]), ak ? 0.06 : 0.056, P, X, 0.004);
    if (ak) { const A = AKM_KIT.arc; solid(g, [...A, ...A.map(([z, yy]) => [z, yy + AKM_KIT.rim]).reverse()], 0.066, P, X, 0.003); }   // (the rim round the AK well's rounded mouth)
    profile(g, shp(SCAR.trig), 0.007, K, X, 0.0008);
    cyl(g, 0.0062, 0.058, K, X, 1.0915, 0.534, 14).rotation.set(0, 0, Math.PI / 2);
    [-1, 1].forEach(sd => { box(g, 0.004, 0.007, 0.03, K, X + sd * 0.029, 1.0915, 0.522).rotation.x = -0.25; });
    box(g, 0.003, 0.004, 0.05, K, R + 0.002, 1.0975, 0.603).rotation.x = 0.12;
    if (!ak) box(g, 0.004, 0.022, 0.018, K, R - 0.0005, 1.077, 0.628).rotation.x = 0.5;
    else { const pd = box(g, 0.026, 0.0035, 0.022, K, X, 1.026, 0.6445); pd.rotation.x = -0.45; box(g, 0.012, 0.01, 0.004, K, X, 1.031, 0.639); }   // the AK paddle release, behind the mag
    // the flared magwell (its loader step, MAGWELL in game/run-state.js): a funnel round the bottom of the well, along its
    // slanting foot, flaring out in two steps down each side, with a lip across the front and the back
    if (T('loader') && !ak) {
      const foot = z => 1.0163 + (z - 0.6311) * 0.1852, band = (z0, z1, a, b) => [[z0, foot(z0) - a], [z1, foot(z1) - a], [z1, foot(z1) - b], [z0, foot(z0) - b]];
      [-1, 1].forEach(sd => {
        profile(g, shp(band(0.626, 0.741, -0.004, 0.009)), 0.004, P, X + sd * 0.0295, 0.0008);
        profile(g, shp(band(0.62, 0.747, 0.009, 0.018)), 0.004, P, X + sd * 0.0335, 0.0008);
      });
      [[0.6215, 0.07], [0.7455, 0.07]].forEach(([z, w]) => { const l = box(g, w, 0.02, 0.005, P, X, foot(z) - 0.007, z); l.rotation.x = z < 0.7 ? 0.2 : -0.2; });
    }
    // ---- the stock, folded out on its hinge: the body and the ribbed pad, the sling hole through the butt, the line
    // where the cheek piece meets the arm under it; the hinge's knuckles on the right
    solid(g, SCAR.stock, 0.05, P, X, 0.006);
    solid(g, SCAR.pad, 0.058, GM.rubber, X, 0.004);
    cyl(g, 0.0065, 0.052, GM.rubber, X, 1.1307, 0.176, 16).rotation.set(0, 0, Math.PI / 2);
    [-1, 1].forEach(sd => box(g, 0.0012, 0.0016, 0.105, GM.rubber, X + sd * 0.025, 1.0803, 0.3645));
    solid(g, SCAR.hinge, 0.06, P, X, 0.003);
    [[1.078, 1.104], [1.111, 1.141], [1.148, 1.18]].forEach(([a, b]) => { const k = new THREE.Mesh(new THREE.CylinderGeometry(0.0085, 0.0085, b - a, 14), U); k.position.set(X - 0.029, (a + b) / 2, 0.432); k.castShadow = true; g.add(k); });
    // ---- the grip and the vertical foregrip, each with its stippled panels
    solid(g, SCAR.grip, 0.042, G, X, 0.006);
    stipple(g, pullInside(SCAR.gripPanel, inset(SCAR.grip, 0.005)), 0.021, 0.0035, P, G);
    solid(g, SCAR.fore, 0.034, G, X, 0.005);
    stipple(g, SCAR.forePanel, 0.017, 0.0035, P, G);
    // ---- the magazine (in the mag group, so the reload drops it): the 20-round box traced off the 17S, or the short
    // 10 (off the 20S's photos: the same box, its foot UP higher, standing only a little below the well), the flutes down
    // its sides, the base plate under the dark seam slanting across it
    if (ak) {
      // the 30-round AK mag, traced (AKM_KIT): its body, the waffle's ribs standing proud of both sides, the seam over the
      // floor plate
      solid(mg, AKM_KIT.mag, 0.05, K, X, 0.003);
      const rib = ([z0, y0, z1, y1], mat, h) => [-1, 1].forEach(sd => { const b = box(mg, 0.0016, h, Math.hypot(z1 - z0, y1 - y0), mat, X + sd * 0.0252, (y0 + y1) / 2, (z0 + z1) / 2); b.rotation.x = -Math.atan2(y1 - y0, z1 - z0); });
      AKM_KIT.ribs.forEach(r => rib(r, GM.hgPoly, 0.0024));
      rib(AKM_KIT.seam, GM.rubber, 0.0018);
    }
    const up = mt ? 0 : 0.075, dn = ([z, yy]) => [z, yy < 0.95 ? yy + up : yy];
    if (!ak) {
    solid(mg, SCAR.mag.map(dn), 0.048, P, X, 0.003);
    [0.6556, 0.6864, 0.7268].forEach(z => box(mg, 0.0505, 0.09 - up, 0.0035, P, X, 0.985 + up / 2, z));
    solid(mg, [[0.6315, 0.9268], [0.734, 0.9262], [0.7342, 0.9164], [0.7301, 0.9142], [0.6833, 0.9117], [0.6365, 0.9134], [0.6315, 0.9224]].map(dn), 0.052, P, X, 0.003);
    { const a = dn([0.6318, 0.9262]), b = dn([0.7335, 0.9395]), sm = box(mg, 0.0525, 0.0024, Math.hypot(b[0] - a[0], b[1] - a[1]), K, X, (a[1] + b[1]) / 2, (a[0] + b[0]) / 2); sm.rotation.x = -Math.atan2(b[1] - a[1], b[0] - a[0]); }
    }
    // ---- the barrel, turned, and the brake on it: its two ports open right through (bridged over the top and under the
    // bottom, the bore dark between); a can threads on in its place
    lathe(g, SCAR.barrel, GM.blued, X, y0, 24);
    let front = 1.263;
    if (!T('supp')) {
      const BK = SCAR.brake, [p0, p1] = SCAR.ports;
      lathe(g, [...BK.filter(p => p[1] < p0[0]), [0.0137, p0[0]], [0.0001, p0[0]]], GM.metal, X, y0, 24);
      lathe(g, [[0.0001, p0[1]], [0.0137, p0[1]], [0.0137, p1[0]], [0.0001, p1[0]]], GM.metal, X, y0, 24);
      lathe(g, [[0.0001, p1[1]], [0.0138, p1[1]], ...BK.filter(p => p[1] > p1[1])], GM.metal, X, y0, 24);
      [-1, 1].forEach(sd => box(g, 0.019, 0.0055, p1[1] - p0[0], GM.metal, X, y0 + sd * 0.0112, (p0[0] + p1[1]) / 2));
      cyl(g, 0.0055, p1[1] - p0[0], GM.rubber, X, y0, (p0[0] + p1[1]) / 2, 14);
      front = 1.3567;
    }
    // ---- the flip-up sights: standing, or with an optic on the rail folded down flat on their bases
    [[SCAR.rear, 1.2035], [SCAR.front, 1.1985]].forEach(([S, cut]) => {
      if (!sight && S !== SCAR.rear) { solid(g, clipTo(S, [[0, 1.18], [2, 1.18], [2, 1.2031], [0, 1.2031]]), 0.016, K, X, 0.0012); solid(g, clipTo(S, [[0, 1.2031], [2, 1.2031], [2, 1.3], [0, 1.3]]), POST_W + 0.001, K, X, 0.0004); return; }   // (its base, and the post up off it as thin as a post is)
      if (!sight) {   // the rear: its post, and on top the aperture plate with its hole, looked through down the gun
        apPart(solid(g, clipTo(S, [[0, 1.18], [2, 1.18], [2, 1.2345], [0, 1.2345]]), 0.022, K, X, 0.0012));
        apPlate(g, X, 0.011, 1.2345, 1.2475, 0.4791, 0.4913, 1.2414, 0.0026, K); return;
      }
      const base = clipTo(S, [[0, 1.18], [2, 1.18], [2, cut], [0, cut]]), zs = base.map(p => p[0]), z0 = Math.min(...zs), z1 = Math.max(...zs);
      solid(g, base, 0.022, K, X, 0.0012); box(g, 0.018, 0.005, (z1 - z0) * 0.8, K, X, cut + 0.0025, (z0 + z1) / 2);
    });
    if (!sight) irons(g, { kind: 'ap', yr: 1.2414, rz: 0.4875, r: 0.0026, yf: 1.2414, fz: 1.131 });   // (the rear's aperture level with the front post's tip: game/view-cam.js)
    const big = sight >= 5;
    return { front, y: y0, magZ: 0, magY: 1.035, slide: bc, bolts: [], travel: 0.1, lock: true, mz: ak ? 0.69 : 0.682, top: RT, sz: 0.6, scopeH: big ? 0.085 : 0.075, scopeR: big ? 1.2 : 1, scopeK: big ? 1.15 : 1,
      laser: { y: 1.0982, z: 1.112 }, barrelR: 0.0107, charge: ch, chargeAt: [R - 0.018, 1.1681, 0.811], chargeTravel: 0.12 };
  },
  // assault rifle: a Colt M4 carbine, traced off a side-on photo (the open dust cover off another). The six-position
  // stock on its buffer tube; the lower with its magwell, the guard and trigger, its pins and the mag release; the A2
  // grip and its checkered panels; the flat-top upper with the forward assist, the port with the carrier in it and the
  // dust cover hanging open under it, the carry handle clamped on its rail; the delta ring, the ribbed two-piece
  // handguard, the A-frame front sight, the stepped carbine barrel and the A2 birdcage. Everything round is turned
  // round, and the slots, panels and pins are set into the surfaces they belong to
  ar(g, m) {
    const y0 = 1.13, RT = 1.18, HR = 0.05, mt = T('mag'), sight = T('sight'), mg = g.userData.magG || g;
    const A = GM.ano, L = GM.anoL, F = GM.furn, H = GM.hgPoly;
    // ---- the stock: its body round the buffer tube, two rows of slots down each side; under it the web with the lock
    // lever, its pin and the sling slot through it; the wide butt and the sling loop at its toe
    const SB = [[0.1265, 1.088], [0.1264, 1.1057], [0.1241, 1.1516], [0.1285, 1.1636], [0.1395, 1.1648], [0.1489, 1.1591], [0.3884, 1.1584], [0.3984, 1.1566], [0.3981, 1.091], [0.37, 1.088]];
    solid(g, SB, 0.062, F, X, 0.012);
    for (let k = 0; k < 5; k++) [1.1222, 1.111].forEach(yy => { const z0 = 0.147 + k * 0.0448; profile(g, shp(rrect(z0, yy - 0.0028, z0 + 0.041, yy + 0.0028, 0.0027).getPoints().map(p => [p.x, p.y])), 0.0626, GM.rubber, X); });   // the slots, flush with the faces
    solid(g, [[0.1275, 1.1], [0.37, 1.1], [0.3609, 1.0863], [0.3518, 1.0779], [0.3466, 1.0628], [0.3399, 1.0557], [0.3348, 1.0523], [0.2867, 1.0529], [0.2421, 1.0144], [0.2347, 1.0105], [0.2322, 1.0114], [0.231, 1.0171], [0.2321, 1.0361], [0.2341, 1.0414], [0.2327, 1.043], [0.1991, 1.0289], [0.1757, 0.9938], [0.1771, 0.9831], [0.168, 0.97], [0.1517, 0.9623], [0.1479, 0.964], [0.1447, 0.9713], [0.1337, 1.0353], [0.1272, 1.095]], 0.044, F, X, 0.003,
      [shp(inset([[0.1533, 1.0795], [0.2108, 1.0795], [0.2108, 1.0878], [0.1533, 1.0878]], -0.003))]);   // the web, the sling slot through it
    solid(g, [[0.1447, 0.9713], [0.1337, 1.0353], [0.1264, 1.1057], [0.1241, 1.1516], [0.1285, 1.1636], [0.1395, 1.1648], [0.1489, 1.1591], [0.152, 1.15], [0.148, 1.1057], [0.1545, 1.0353], [0.164, 0.98], [0.168, 0.97], [0.1517, 0.9623], [0.1479, 0.964]], 0.066, F, X, 0.008);   // the butt
    cyl(g, 0.024, 0.0445, GM.anoL, X, 1.055, 0.177, 24).rotation.set(0, 0, Math.PI / 2);                   // the round dimple in the web
    cyl(g, 0.0075, 0.012, GM.metal2, X, 1.047, 0.306, 14).rotation.x = 0;          // the lock lever's pin
    { const t = new THREE.Mesh(new THREE.TorusGeometry(0.0105, 0.0024, 6, 14), GM.metal2); t.rotation.set(0.5, Math.PI / 2, 0); t.position.set(X, 0.967, 0.18); g.add(t); }   // the sling loop
    // the buffer tube, the castle nut and the lower's rear tower round it
    cyl(g, 0.0226, 0.06, L, X, y0, 0.414, 24); ribTube(g, 0.027, 0.012, L, X, y0, 0.436, 8, 0.0022);
    // ---- the lower (its own shade): the receiver, the wider magwell and its flared lip, the guard (narrower, its
    // opening traced) and the trigger in it; the pins, the selector, the mag release in its fence, the bolt catch
    profile(g, shp(inset([[0.4435, 1.0775], [0.4435, 1.157], [0.4565, 1.157], [0.4565, 1.1125], [0.597, 1.1125], [0.597, 1.104], [0.7575, 1.104], [0.7575, 1.0907], [0.7533, 1.0886], [0.7495, 1.0859], [0.739, 1.0815], [0.7341, 1.0727], [0.734, 1.045], [0.628, 1.045], [0.628, 1.052], [0.53, 1.052], [0.505, 1.0557], [0.4771, 1.0606], [0.4654, 1.0713]], 0.003)), 0.044, L, X, 0.003, 2);
    solid(g, [[0.6268, 1.078], [0.7345, 1.078], [0.7345, 1.034], [0.6268, 1.034]], 0.056, L, X, 0.004);
    solid(g, [[0.6262, 1.036], [0.7375, 1.036], [0.738, 1.0241], [0.7335, 1.0205], [0.6295, 1.0205], [0.6262, 1.026]], 0.06, L, X, 0.003);
    // the flared mag well (its mod): a funnel lip standing out round the bottom of the magwell, deeper a level
    if (m.well) { const d = 0.008 + 0.002 * (m.well - 1); solid(g, [[0.6215, 1.0215], [0.7425, 1.0215], [0.7465, 1.0215 - d], [0.6175, 1.0215 - d]], 0.074, L, X, 0.002); }
    const GH = [[0.5614, 1.0097], [0.55, 1.0192], [0.547, 1.0252], [0.546, 1.0331], [0.5479, 1.0399], [0.5527, 1.0459], [0.5614, 1.0506], [0.6056, 1.052], [0.6195, 1.0449], [0.6242, 1.0372], [0.6255, 1.0273], [0.6231, 1.0196], [0.6158, 1.0108], [0.5793, 1.0094]];
    solid(g, [[0.508, 1.058], [0.6285, 1.058], [0.6285, 1.012], [0.627, 1.004], [0.6203, 1.0026], [0.6163, 1.0052], [0.5614, 1.0047], [0.5568, 1.0027], [0.5368, 1.0038], [0.5307, 1.0023], [0.5294, 1.0004], [0.522, 0.99], [0.515, 1.0]], 0.03, L, X, 0.002, [shp(inset(GH, -0.002))]);
    profile(g, shp([[0.5658, 1.056], [0.5658, 1.0498], [0.5635, 1.0392], [0.5642, 1.0303], [0.5685, 1.0197], [0.5755, 1.0118], [0.5793, 1.0104], [0.5771, 1.0139], [0.5722, 1.0232], [0.571, 1.0326], [0.5736, 1.0423], [0.5802, 1.0505], [0.5802, 1.056]]), 0.007, GM.steelDk, X, 0.0008);
    [[0.462, 1.1005, 0.0062], [0.751, 1.0955, 0.004], [0.548, 1.08, 0.0032], [0.578, 1.0765, 0.0032]].forEach(([z, yy, r]) => cyl(g, r, 0.0508, GM.metal2, X, yy, z, 12).rotation.set(0, 0, Math.PI / 2));   // takedown and pivot pins, hammer and trigger pins
    cyl(g, 0.0062, 0.0508, GM.metal2, X, 1.08, 0.502, 14).rotation.set(0, 0, Math.PI / 2);                   // the selector's barrel through the receiver
    { const lv = box(g, 0.004, 0.007, 0.026, GM.metal2, X + 0.0265, 1.08, 0.507); lv.rotation.x = -0.6; }    // its lever, on the left
    profile(g, shp([[0.598, 1.0585], [0.625, 1.0585], [0.625, 1.0865], [0.598, 1.0865]], [rrect(0.6025, 1.063, 0.6205, 1.082, 0.006)]), 0.005, L, X - 0.0255, 0.0008);   // the mag release's fence, on the right
    cyl(g, 0.0055, 0.006, GM.metal2, X - 0.026, 1.0725, 0.6115, 14).rotation.set(0, 0, Math.PI / 2);         // and its button
    box(g, 0.005, 0.024, 0.012, GM.metal2, X + 0.0265, 1.087, 0.619);                                        // bolt catch, on the left
    // ---- the A2 grip, traced, its checkered panels set in from its edges
    const GP = [[0.4034, 0.9175], [0.4146, 0.9123], [0.4801, 0.8976], [0.4851, 0.8995], [0.489, 0.9044], [0.4899, 0.9078], [0.4841, 0.9153], [0.4846, 0.921], [0.5065, 0.9601], [0.5124, 0.9657], [0.5218, 0.965], [0.5245, 0.9675], [0.5201, 0.9759], [0.5197, 0.981], [0.522, 0.99], [0.515, 1.04], [0.508, 1.064], [0.473, 1.064], [0.4808, 1.0531], [0.4812, 1.0438], [0.4775, 1.0329], [0.4018, 0.9236]];
    solid(g, GP, 0.042, F, X, 0.006);
    checker(g, pullInside([[0.4655, 1.006], [0.472, 1.0115], [0.482, 1.013], [0.493, 1.011], [0.4995, 1.005], [0.501, 0.995], [0.497, 0.965], [0.489, 0.94], [0.48, 0.92], [0.473, 0.915], [0.43, 0.92], [0.421, 0.925], [0.42, 0.932]], inset(GP, 0.0075)), 0.021, 0.0028, 0.62, GM.rubber, F);
    // ---- the upper: built in two halves meeting down the middle, the port cut through the right one only (a dark wall
    // behind it); the shoulders closing in to the rail and the rail with its cross slots; the forward assist and the
    // brass deflector on the right
    const UP = [[0.4555, 1.1105], [0.5975, 1.1105], [0.5975, 1.1025], [0.7525, 1.1025], [0.7525, 1.1645], [0.4555, 1.1645]];
    profile(g, shp(UP), 0.022, A, X + 0.013, 0.002);
    profile(g, shp(UP, [rrect(0.616, 1.125, 0.732, 1.156, 0.005)]), 0.022, A, X - 0.013, 0.002);
    box(g, 0.001, 0.027, 0.112, GM.rubber, X - 0.0006, 1.1405, 0.674);
    xsec(g, shp([[X - 0.026, 1.162], [X + 0.026, 1.162], [X + 0.0185, 1.1705], [X - 0.0185, 1.1705]]), 0.4565, 0.7515, A, 0.001);
    xsec(g, shp([[X - 0.0125, 1.1695], [X + 0.0125, 1.1695], [X + 0.0168, 1.1725], [X + 0.0168, 1.1745], [X + 0.0148, RT], [X - 0.0148, RT], [X - 0.0168, 1.1745], [X - 0.0168, 1.1725]]), 0.4585, 0.7515, GM.rail, 0.0006);
    for (let k = 0; k < 17; k++) box(g, 0.0338, 0.0034, 0.0065, GM.rubber, X, RT - 0.0015, 0.4655 + k * 0.0172);   // the rail's cross slots, flush with its top
    lathe(g, [[0.0001, 0.5605], [0.0128, 0.5605], [0.0135, 0.566], [0.0135, 0.588], [0.011, 0.5955], [0.006, 0.598], [0.0001, 0.598]], A, X - 0.0255, 1.1475, 18);   // the forward assist's housing
    cyl(g, 0.0105, 0.008, GM.metal2, X - 0.0255, 1.1475, 0.557, 16);                                          // and its button
    profile(g, shp([[0.5975, 1.128], [0.6135, 1.128], [0.6145, 1.15], [0.611, 1.1655], [0.5975, 1.1655]]), 0.007, A, X - 0.0255, 0.0015);   // the brass deflector
    // the bolt carrier in the port (it runs back on each shot); the steel dust cover swung down on its hinge rod under the
    // port, lying against the receiver, its rim standing up round it and its latch at its foot
    const bc = box(g, 0.0202, 0.0272, 0.104, GM.steel, X - 0.0109, 1.1405, 0.674);
    cyl(g, 0.002, 0.13, GM.metal2, X - 0.0255, 1.1225, 0.673, 8);
    const DC = [[0.609, 1.1215], [0.737, 1.1215], [0.737, 1.0835], [0.7335, 1.08], [0.6125, 1.08], [0.609, 1.0835]];
    profile(g, shp(DC), 0.003, GM.blued, X - 0.0265, 0.0006);
    profile(g, shp(DC, [shp(inset(DC, 0.004))]), 0.0016, GM.blued, X - 0.0292, 0.0004);                      // its rim
    box(g, 0.003, 0.009, 0.016, GM.metal2, X - 0.0294, 1.0865, 0.673);
    // the charging handle's T at the back of the upper, kept plain (its own group: the reload draws it back, weapons/reload.js)
    const ch = new THREE.Group(); g.add(ch);
    profile(ch, shp([[0.4545, 1.1585], [0.4705, 1.1585], [0.4705, 1.177], [0.4585, 1.177], [0.4548, 1.172]]), 0.058, GM.metal2, X, 0.0015);
    box(ch, 0.006, 0.006, 0.012, GM.metal2, X + 0.031, 1.1715, 0.468);                                       // its latch
    // ---- without an optic: the carry handle clamped on the rail, the A2 rear sight in its back end (the aperture between
    // its ears, the windage knob, the elevation drum), the clamp's screws; the handle's top ahead of the sight kept down below
    // the line through the hole, so looking through it you see the front post over it, not the handle's back
    if (!sight) {
      profile(g, shp(inset([[0.4798, 1.1795], [0.4914, 1.2045], [0.5464, 1.2045], [0.5464, 1.2275], [0.5875, 1.2272], [0.7197, 1.224], [0.7272, 1.2221], [0.7443, 1.2194], [0.7494, 1.2148], [0.7518, 1.2099], [0.7521, 1.1795]], 0.0025),
        [shp(inset([[0.5756, 1.1873], [0.7156, 1.1869], [0.7233, 1.1944], [0.7356, 1.196], [0.7356, 1.2063], [0.7301, 1.2126], [0.7216, 1.2141], [0.5755, 1.2141], [0.5685, 1.2109], [0.5661, 1.2077], [0.565, 1.2027], [0.5655, 1.1953]], -0.0025))]), 0.025, A, X, 0.0025, 2);
      solid(g, [[0.479, 1.1765], [0.7525, 1.1765], [0.7525, 1.1885], [0.479, 1.1885]], 0.04, A, X, 0.002);    // its base round the rail
      [-1, 1].forEach(sd => apPart(profile(g, shp([[0.4983, 1.2045], [0.546, 1.2045], [0.5464, 1.2418], [0.5396, 1.2444], [0.5125, 1.2458], [0.5054, 1.2422], [0.4983, 1.2352]]), 0.004, A, X + sd * 0.0125, 0.001)));   // the ears, wide apart
      // the aperture up between them: a thin ring round a big hole on a slim stem, open all round it to the ears, so
      // looking through it the ring frames the front post with the world round it (AP_RING: the hole's radius, the
      // ring's), in line with the front post's tip (looked through in first person: game/view-cam.js)
      { const [hr, or] = AP_RING, ring = new THREE.Shape(), hole = new THREE.Path(); ring.absarc(X, 1.2393, or, 0, Math.PI * 2, false); hole.absarc(X, 1.2393, hr, 0, Math.PI * 2, true); ring.holes.push(hole);
        apPart(xsec(g, ring, 0.518, 0.522, A)); apPart(xsec(g, shp([[X - 0.002, 1.2045], [X + 0.002, 1.2045], [X + 0.002, 1.2393 - or + 0.0008], [X - 0.002, 1.2393 - or + 0.0008]]), 0.518, 0.522, A)); }
      irons(g, { kind: 'ap', yr: 1.2393, rz: 0.52, r: AP_RING[0], yf: 1.2305, fz: 1.0967 });
      cyl(g, 0.0108, 0.008, GM.metal2, X - 0.0165, 1.2255, 0.517, 18).rotation.set(0, 0, Math.PI / 2);        // windage knob
      ribTube(g, 0.0085, 0.033, GM.metal2, X, 1.1985, 0.5235, 12, 0.0012).rotation.set(0, Math.PI / 2, 0);    // the elevation drum
      [0.533, 0.735].forEach(z => { cyl(g, 0.0068, 0.042, GM.metal2, X, 1.1835, z, 14).rotation.set(0, 0, Math.PI / 2); cyl(g, 0.009, 0.007, GM.metal2, X + 0.0235, 1.1835, z, 14).rotation.set(0, 0, Math.PI / 2); });   // the clamp's screws and thumb nuts
    } else {
      // with an optic, a folded backup sight at the back of the rail
      box(g, 0.03, 0.007, 0.034, A, X, RT + 0.0035, 0.478); box(g, 0.024, 0.005, 0.028, GM.metal2, X, RT + 0.0095, 0.476).rotation.x = -0.08;
    }
    // ---- the barrel nut and the knurled delta ring against the upper; the handguard in two halves split down the
    // sides, its rear lip, the ribs round it tapering forward and its front rounded into the cap, the heat shield dark
    // inside; the barrel inside it all
    cyl(g, 0.03, 0.008, A, X, y0, 0.7555, 24);
    ribTube(g, 0.041, 0.028, A, X, y0, 0.773, 30, 0.0012, 1, 0.86);
    {
      const base = z => 0.0512 - 0.02 * (z - 0.797), pts = [[0.03, 0.7865], [0.0518, 0.7865], [0.0532, 0.7885], [0.0532, 0.7955], [base(0.797), 0.797]];
      for (let k = 0; k < 11; k++) { const zc = 0.8105 + k * 0.0197; pts.push([base(zc - 0.0028), zc - 0.0028], [base(zc) + 0.0014, zc - 0.0016], [base(zc) + 0.0014, zc + 0.0016], [base(zc + 0.0028), zc + 0.0028]); }
      pts.push([base(1.02), 1.02], [0.0462, 1.0265], [0.04, 1.0295], [0.0335, 1.0305], [0.0335, 1.0365], [0.03, 1.0365], [0.03, 0.7865]);
      [0, 1].forEach(h => {
        const geo = new THREE.LatheGeometry(pts.map(([r, z]) => new THREE.Vector2(r, z)), 26, Math.PI / 2 + h * Math.PI + 0.004, Math.PI - 0.008); geo.rotateX(Math.PI / 2);   // (a hairline split, not a gap you see through)
        const hm = new THREE.Mesh(geo, H); hm.position.set(X, y0, 0); hm.scale.x = 0.95; hm.castShadow = true; g.add(hm);
      });
      cyl(g, 0.0435, 0.244, GM.rubber, X, y0, 0.9115, 24).scale.x = 0.95;   // (the heat shield, the whole length inside it, so nothing shows through the split; its ends just inside the handguard's, not on them)
    }
    // ---- barrel, turned: through the front sight, the groove cut for a launcher's clamp, then on to the muzzle (thicker
    // with each heavy-barrel level)
    const br = [0.0119, 0.0135, 0.0152, 0.017][m.heavy || 0];
    lathe(g, [[0.0001, 0.75], [br, 0.75], [br, 1.164], [br - 0.0018, 1.1695], [br - 0.0018, 1.2011], [br, 1.2052], [br, 1.3445], [0.0001, 1.3445]], GM.blued, X, y0, 24);
    // ---- the A-frame front sight: its base clamped round the barrel with the bayonet lug under it, the tower and its
    // window, the ears round the post (all left off under an optic), the sling swivel hanging under it
    solid(g, [[1.0365, 1.1162], [1.0901, 1.1162], [1.0945, 1.111], [1.095, 1.0959], [1.0987, 1.0937], [1.1075, 1.0936], [1.1092, 1.0981], [1.1202, 1.0986], [1.1239, 1.1026], [1.1237, 1.1107], [1.1185, 1.1139], [1.1185, 1.1175], [1.1115, 1.1175], [1.1115, 1.161], [1.0365, 1.161]], 0.032, A, X, 0.004);
    if (!sight) {   // (with an optic the tower's off, a low gas block left: nothing standing up in its picture)
      solid(g, [[1.0371, 1.158], [1.0379, 1.1677], [1.0706, 1.2115], [1.1112, 1.2115], [1.1115, 1.158]], 0.022, A, X, 0.002,
        [shp(inset([[1.0553, 1.163], [1.1006, 1.163], [1.1016, 1.1695], [1.1016, 1.207], [1.0843, 1.207], [1.0806, 1.2068], [1.0774, 1.2045], [1.0517, 1.1691], [1.0522, 1.1656]], -0.002))]);
      [-1, 1].forEach(sd => profile(g, shp([[1.0812, 1.205], [1.1112, 1.205], [1.1109, 1.2244], [1.1078, 1.2311], [1.1019, 1.2345], [1.0956, 1.2336], [1.0917, 1.2346], [1.0841, 1.229]]), 0.004, A, X + sd * 0.0095, 0.001));
      profile(g, shp([[1.0918, 1.185], [1.1016, 1.185], [1.1016, 1.2305], [1.0918, 1.2305]]), POST_W, GM.metal2, X, 0.0004);   // the post
    }
    box(g, 0.012, 0.024, 0.012, A, X, 1.104, 1.0525);
    { const t = new THREE.Mesh(new THREE.TorusGeometry(0.0098, 0.0022, 6, 14), GM.metal2); t.rotation.set(-0.35, Math.PI / 2, 0); t.position.set(X, 1.0805, 1.0525); g.add(t); }
    // ---- the A2 birdcage, turned: its lock washer, two rings, five slots round the top and sides (closed underneath, the
    // dark bore seen through them) and the chamfered mouth (a can threads on in its place)
    let front = 1.3445;
    if (!T('supp')) {
      lathe(g, [[0.0001, 1.3445], [0.0142, 1.3445], [0.0152, 1.3479], [0.0167, 1.3517], [0.0167, 1.3625], [0.016, 1.3646], [0.0167, 1.3667], [0.0167, 1.3726], [0.016, 1.3747], [0.0167, 1.3768], [0.0167, 1.3885], [0.011, 1.3885]], A, X, y0, 24);
      lathe(g, [[0.011, 1.4155], [0.0167, 1.4155], [0.0167, 1.4191], [0.0128, 1.4259], [0.0105, 1.4259], [0.0105, 1.4155], [0.011, 1.4155]], A, X, y0, 24);
      cyl(g, 0.0106, 0.04, GM.rubber, X, y0, 1.405, 16);
      const S = [-1.55, -0.78, 0, 0.78, 1.55].map(a => Math.PI + a), half = 0.11;   // slot centres, measured from straight down
      for (let i = 0; i < S.length; i++) {
        const a0 = S[i] + half, a1 = (i + 1 < S.length ? S[i + 1] : S[0] + Math.PI * 2) - half, sh = new THREE.Shape(), N = Math.max(2, Math.ceil((a1 - a0) / 0.2));
        const pt = (r, a) => [X + r * Math.sin(a), y0 - r * Math.cos(a)];
        for (let k = 0; k <= N; k++) { const p = pt(0.0167, a0 + (a1 - a0) * k / N); k ? sh.lineTo(...p) : sh.moveTo(...p); }
        for (let k = N; k >= 0; k--) sh.lineTo(...pt(0.011, a0 + (a1 - a0) * k / N));
        sh.closePath(); xsec(g, sh, 1.388, 1.4158, A);
      }
      front = 1.4259;
    }
    // ---- the magazine (in the mag group, so the reload can drop it): a 30-round STANAG traced off the photo, straight
    // under the well and then bending forward, two ribs pressed out down each side following it and the floor plate on
    // its foot; a 40-round polymer one the same, only longer; or a drum
    const mz = 0.6813, mtop = 1.0205;
    if (mt <= 1) {
      const k = mt === 1 ? 1.32 : 1, w = 0.046, mat = mt === 1 ? F : GM.magAl;
      const st = (z0, [z, y]) => y >= 0.99 ? [z, y] : [z0 + (z - z0) * k, 0.99 - (0.99 - y) * k];
      const BK = [[0.6293, 1.066], [0.6293, 1.0021], [0.6315, 0.975], [0.6348, 0.9494], [0.6398, 0.9229], [0.6505, 0.882], [0.6628, 0.8394]].map(p => st(0.6293, p));
      const FR = [[0.7335, 1.066], [0.7335, 1.0], [0.7348, 0.975], [0.7384, 0.9575], [0.7451, 0.9283], [0.7545, 0.895], [0.7646, 0.8611]].map(p => st(0.7335, p));
      solid(mg, [...BK, ...FR.slice().reverse()], w, mat, X, 0.004);
      const lerp = (a, b, f) => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
      [0.26, 0.72].forEach(f => { const rib = []; for (let i = 1; i < 7; i++) rib.push(lerp(BK[i], FR[i], f - 0.03)); for (let i = 6; i > 0; i--) rib.push(lerp(BK[i], FR[i], f + 0.03)); rib[0][1] -= 0.006; rib[rib.length - 1][1] -= 0.006; rib[5][1] += 0.01; rib[6][1] += 0.01; profile(mg, shp(rib), w + 0.003, mat, X, 0.0008); });
      const b0 = BK[6], b1 = FR[6], ul = Math.hypot(b1[0] - b0[0], b1[1] - b0[1]), u = [(b1[0] - b0[0]) / ul, (b1[1] - b0[1]) / ul], n = [-u[1], u[0]];
      const at = (p, a, c) => [p[0] + u[0] * a + n[0] * c, p[1] + u[1] * a + n[1] * c];
      solid(mg, [at(b0, -0.003, -0.0035), at(b1, 0.003, -0.0035), at(b1, 0.003, 0.009), at(b0, -0.003, 0.009)], w + 0.005, mt === 1 ? GM.rubber : GM.metal2, X, 0.002);   // the floor plate
    } else {
      const big = mt >= 3, r = big ? 0.085 : 0.07, len = big ? 0.17 : 0.142, ox = X + 0.01, cz = mz + 0.006, cyy = 0.955 - r * 0.78;
      box(mg, 0.046, 0.1, 0.1, F, X, 1.005, mz); for (let k = 0; k < 3; k++) box(mg, 0.05, 0.0035, 0.102, GM.rubber, X, 1.0 - k * 0.018, mz);
      box(mg, 0.058, 0.034, 0.12, F, X + 0.004, 0.956, mz + 0.004);
      cyl(mg, r, len, F, ox, cyy, cz, 32);
      [-1, 1].forEach(sd => {
        ring(mg, r + 0.0035, 0.012, F, ox, cyy, cz + sd * (len / 2 - 0.008)).geometry = new THREE.CylinderGeometry(r + 0.0035, r + 0.0035, 0.012, 32);
        cyl(mg, r * 0.72, 0.005, F, ox, cyy, cz + sd * (len / 2 + 0.002), 28); cyl(mg, r * 0.3, 0.004, GM.metal2, ox, cyy, cz + sd * (len / 2 + 0.005), 18);
      });
      ring(mg, r + 0.002, 0.009, GM.rubber, ox, cyy, cz).geometry = new THREE.CylinderGeometry(r + 0.002, r + 0.002, 0.009, 32);
      box(mg, 0.012, 0.034, 0.009, GM.metal2, ox + r * 0.35, cyy + r * 0.2, cz - len / 2 - 0.01); cyl(mg, 0.0095, 0.01, GM.metal2, ox, cyy, cz - len / 2 - 0.01, 14);
    }
    // ---- optics sit straight on the rail (weapons/attachments.js builds the holo and the scope; the red dot is an
    // Aimpoint-style tube on a low mount, built here)
    const top = RT, sz = 0.6;
    if (sight === 1) fitted(g, () => {
      const sy = top + 0.038;
      profile(g, shp([[sz - 0.03, top], [sz + 0.03, top], [sz + 0.024, top + 0.017], [sz - 0.024, top + 0.017]]), 0.032, A, X, 0.001);
      box(g, 0.012, 0.011, 0.02, A, X + 0.019, top + 0.006, sz); cyl(g, 0.0055, 0.01, GM.metal2, X + 0.026, top + 0.006, sz, 12).rotation.set(0, 0, Math.PI / 2);
      // (the tube hollow, its rings round it: you look through it, down its length to the front lens)
      const hol = (r0, r1, z0, z1, m) => lathe(g, [[r0, z0], [r1, z0], [r1, z1], [r0, z1], [r0, z0]], m, X, sy, 24);
      [-0.03, 0.03].forEach(o => { box(g, 0.011, 0.015, 0.015, A, X, top + 0.016, sz + o); hol(0.0205, 0.025, sz + o - 0.0065, sz + o + 0.0065, A); });
      hol(0.0185, 0.021, sz - 0.0575, sz + 0.0575, A);
      lathe(g, [[0.0185, sz + 0.0555], [0.021, sz + 0.0555], [0.025, sz + 0.0805], [0.0215, sz + 0.0805], [0.0185, sz + 0.0555]], A, X, sy, 24); hol(0.0215, 0.0252, sz + 0.0795, sz + 0.0905, GM.metal2);
      cyl(g, 0.022, 0.004, GM.glass, X, sy, sz + 0.091, 20); hol(0.0185, 0.023, sz - 0.0675, sz - 0.0565, GM.metal2); cyl(g, 0.019, 0.003, GM.glass, X, sy, sz - 0.069, 20);
      // (its dot out at infinity, seen through the front lens; looked down in first person like any red dot: game/view-cam.js)
      reticleOn(g, 'dot', X, sy, sz + 0.087, 0.021); g.userData.optic = { kind: 'dot', x: X, y: sy, zr: sz - 0.069, zf: sz + 0.091, r: 0.019 };
      cyl(g, 0.0085, 0.013, GM.metal2, X, sy + 0.026, sz + 0.008, 14).rotation.set(0, 0, 0); cyl(g, 0.0085, 0.013, GM.metal2, X - 0.026, sy, sz + 0.008, 14).rotation.set(0, 0, Math.PI / 2);
    });
    // ---- laser, taped to the left of the handguard with olive tape: a pointer, then a proper module
    if (T('laser')) fitted(g, () => {
      const lx = X + HR * 0.95 + 0.013, ly = y0, lz = 0.96, em = new THREE.Object3D();
      if (T('laser') === 1) { cyl(g, 0.011, 0.11, GM.metal2, lx, ly, lz); ring(g, 0.0125, 0.012, A, lx, ly, lz + 0.05); box(g, 0.008, 0.008, 0.004, GM.red, lx, ly, lz + 0.057); em.position.set(lx, ly, lz + 0.06); }
      else { box(g, 0.03, 0.036, 0.11, GM.tan, lx + 0.004, ly, lz); box(g, 0.01, 0.01, 0.004, GM.laserG, lx + 0.004, ly + 0.008, lz + 0.056); box(g, 0.01, 0.01, 0.004, GM.glass, lx + 0.004, ly - 0.008, lz + 0.056); box(g, 0.012, 0.006, 0.02, GM.metal2, lx + 0.004, ly + 0.02, lz - 0.02); em.position.set(lx + 0.004, ly + 0.008, lz + 0.059); }
      [lz - 0.032, lz + 0.03].forEach(z => tapeWrap(g, X, y0, z, HR + 0.002, lx + (T('laser') === 1 ? 0.012 : 0.02), ly, 0.95));
      em.userData.isLaser = true; g.add(em); g.userData.laserEm = em;   // (isLaser: found again on the copy you carry, weapons/laser.js)
    });
    // ---- light, on the barrel ahead of the front sight, low on the left: taped on, then a weapon light in a barrel ring
    if (T('light')) fitted(g, () => {
      const lx = X + 0.024, ly = y0 - 0.029, lz = 1.25;
      if (T('light') === 1) {
        cyl(g, 0.016, 0.13, GM.metal2, lx, ly, lz); ring(g, 0.02, 0.03, A, lx, ly, lz + 0.075); cyl(g, 0.017, 0.004, GM.lens, lx, ly, lz + 0.091);
        [lz - 0.035, lz + 0.03].forEach(z => tapeWrap(g, X, y0, z, br + 0.003, lx + 0.017, ly - 0.004));
      } else {
        ring(g, br + 0.006, 0.028, A, X, y0, lz - 0.02); box(g, 0.015, 0.028, 0.024, A, X + 0.014, y0 - 0.016, lz - 0.02).rotation.z = 0.6;
        cyl(g, 0.018, 0.13, A, lx, ly, lz); ring(g, 0.024, 0.034, GM.metal2, lx, ly, lz + 0.08); cyl(g, 0.021, 0.004, GM.lens, lx, ly, lz + 0.098);
        ring(g, 0.015, 0.014, GM.rubber, lx, ly, lz - 0.072); box(g, 0.006, 0.013, 0.028, GM.rubber, lx + 0.019, ly, lz - 0.038);
      }
    });
    if (m.gl) {   // an M203 under the handguard
      box(g, 0.028, 0.026, 0.22, A, X, y0 - HR - 0.011, 0.92); cyl(g, 0.034, 0.23, A, X, y0 - HR - 0.058, 0.92); ring(g, 0.036, 0.012, GM.metal2, X, y0 - HR - 0.058, 1.035);
      box(g, 0.046, 0.046, 0.07, A, X, y0 - HR - 0.04, 0.78); box(g, 0.011, 0.028, 0.011, GM.metal2, X, y0 - HR - 0.072, 0.78);
    }
    return { front, y: y0, magZ: 0, magY: mtop, slide: bc, bolts: [], travel: 0.12, lock: true, mz, top, sz, scopeH: 0.05, noSight: sight === 1, noLaser: true, noLight: true, charge: ch, chargeAt: [X + 0.026, 1.172, 0.462], chargeTravel: 0.11 };
  },
  // light machine gun: the classic M60, traced off a side-on photo, with the hard green 100-round box off another. The
  // stock with its ribbed sides and steel butt plate; the receiver with the charging handle's track and knob on the
  // right, the feed cover on top and the ladder rear sight standing in front of it (folded flat under an optic); the
  // trigger housing, the raked pistol grip with its grooves, the big round guard; the forearm, ribbed down its sides,
  // with the heat shield and its row of oval holes over the barrel; the turned barrel and its two collars, the thin
  // A-frame front sight, the slotted flash hider; the gas cylinder under the barrel and the bipod folded back along it
  // (down on its legs with the bipod mod); the ammo box hanging on the left, its lid propped open and the belt rising
  // out of it into the feed tray
  lmg(g, m) {
    const K = GM.metal, P = GM.furn, y0 = 1.13, mg = g.userData.magG || g, sight = T('sight');
    // ---- the stock: ribs down both sides, the steel butt plate with the shoulder rest folded on top
    const ST = [[0.0605, 0.9989], [0.0632, 1.0294], [0.0634, 1.0782], [0.0598, 1.1458], [0.0558, 1.1806], [0.0573, 1.1859], [0.0647, 1.1899], [0.0638, 1.1962], [0.0724, 1.1979], [0.0742, 1.2005], [0.0883, 1.1992], [0.1095, 1.1864], [0.1182, 1.1849], [0.1237, 1.1872], [0.1304, 1.1862], [0.1357, 1.1801], [0.1735, 1.17], [0.179, 1.1655], [0.1848, 1.1654], [0.1875, 1.1688], [0.1928, 1.1701], [0.258, 1.1695], [0.258, 1.0495], [0.2384, 1.0492], [0.2281, 1.0458], [0.141, 0.9888], [0.1257, 0.9821], [0.0981, 0.9767], [0.0837, 0.9773], [0.0674, 0.9835]];
    solid(g, ST, 0.066, P, X, 0.012);
    { const R = []; for (let yy = 1.006; yy < 1.162; yy += 0.0093) { const z0 = 0.084, edge = yy < 1.0458 ? 0.141 + (yy - 0.9888) / (1.0458 - 0.9888) * 0.0871 : 0.26, z1 = Math.min(0.244, edge - 0.016); if (z1 - z0 > 0.02) R.push([0.0666, 0.0026, z1 - z0, X, yy, (z0 + z1) / 2]); } boxes(g, R, GM.rubber); }   // the ribs' grooves, flush with the faces
    solid(g, inset([[0.0605, 0.9989], [0.0632, 1.0294], [0.0634, 1.0782], [0.0598, 1.1458], [0.0558, 1.1806], [0.0573, 1.1859], [0.0647, 1.1899], [0.0638, 1.1962], [0.0724, 1.1979], [0.0742, 1.2005], [0.08, 1.2], [0.0745, 1.185], [0.0745, 1.1458], [0.0762, 1.0782], [0.0762, 1.0294], [0.0742, 0.99], [0.0674, 0.9835]], -0.0003), 0.07, K, X, 0.004);   // the butt plate (a hair proud of the stock's own back, so the two don't flicker through each other)
    // ---- the receiver: its body, the feed cover on top, the trigger housing under it; on the right the charging
    // handle's track with the handle in it and the vent holes
    solid(g, [[0.2545, 1.0607], [0.6793, 1.0607], [0.6794, 1.1564], [0.6764, 1.1589], [0.646, 1.165], [0.44, 1.172], [0.4395, 1.1844], [0.3668, 1.1711], [0.3629, 1.1744], [0.2871, 1.1686], [0.254, 1.1693]], 0.064, K, X, 0.004);
    solid(g, [[0.4395, 1.168], [0.646, 1.168], [0.6463, 1.18], [0.645, 1.1852], [0.6408, 1.1846], [0.639, 1.1816], [0.6331, 1.184], [0.624, 1.1799], [0.6218, 1.1835], [0.5856, 1.1863], [0.5823, 1.1926], [0.5777, 1.1911], [0.5727, 1.1939], [0.5388, 1.1941], [0.5213, 1.1885], [0.5174, 1.1901], [0.4961, 1.1895], [0.4914, 1.1846], [0.4887, 1.1883], [0.4505, 1.1861], [0.4482, 1.1856], [0.446, 1.1817], [0.4395, 1.1844]], 0.06, GM.metal2, X, 0.003);
    solid(g, [[0.4338, 1.064], [0.619, 1.064], [0.619, 1.0457], [0.4338, 1.0456]], 0.05, K, X, 0.003);
    box(g, 0.003, 0.009, 0.148, GM.rubber, X - 0.0316, 1.093, 0.326);                                         // the handle's track
    const sl = new THREE.Group(); g.add(sl);
    box(sl, 0.008, 0.012, 0.02, GM.metal2, X - 0.034, 1.093, 0.385); cyl(sl, 0.0085, 0.02, GM.steel, X - 0.046, 1.093, 0.385, 16).rotation.set(0, 0, Math.PI / 2);
    [0.455, 0.465, 0.475].forEach(z => cyl(g, 0.0032, 0.0646, GM.rubber, X, 1.135, z, 10).rotation.set(0, 0, Math.PI / 2));
    // the ejection port on the right, the bolt in it running right back past its rear edge on each shot (the charging
    // handle stays where it is: it doesn't ride with the bolt)
    profile(g, shp([[0.47, 1.103], [0.575, 1.103], [0.575, 1.13], [0.47, 1.13]]), 0.002, GM.rubber, X - 0.0322, 0.0004);
    const bolt = box(g, 0.003, 0.021, 0.06, GM.steel, X - 0.0333, 1.1165, 0.545); bolt.userData.clip = 0.47;
    // the rear sight: the ladder standing up in front of the feed cover (lying flat under an optic)
    const RS = [[0.6539, 1.158], [0.6577, 1.169], [0.658, 1.1789], [0.6552, 1.1851], [0.6625, 1.1993], [0.657, 1.2022], [0.6601, 1.2081], [0.6565, 1.2248], [0.6605, 1.2338], [0.6606, 1.2575], [0.6651, 1.2585], [0.6672, 1.2307], [0.6712, 1.2197], [0.6684, 1.208], [0.6731, 1.2035], [0.6684, 1.2002], [0.6684, 1.1939], [0.6744, 1.184], [0.6764, 1.1589]];
    if (!sight) {   // (the ladder up to the aperture plate at its top, the hole through it looked through down the gun)
      apPart(profile(g, shp(clipTo(RS, [[0.6, 1.15], [0.7, 1.15], [0.7, 1.2305], [0.6, 1.2305]])), 0.012, K, X, 0.0012)); apPart(cyl(g, 0.0065, 0.03, GM.metal2, X, 1.195, 0.665, 14)).rotation.set(0, 0, Math.PI / 2);
      apPlate(g, X, 0.0065, 1.2305, 1.2585, 0.66, 0.6712, 1.236, 0.0026, K);
      irons(g, { kind: 'ap', yr: 1.236, rz: 0.66, r: 0.0026, yf: 1.236, fz: 1.3755, relief: 0.13 });   // (your cheek on the stock, the aperture a hand's breadth out, not right at your eye)
    }
    else box(g, 0.014, 0.006, 0.06, K, X, 1.1615, 0.69);
    // ---- the pistol grip, raked back, with its grooves; the big round guard and the trigger in it
    const GR = [[0.4329, 1.064], [0.4331, 1.0447], [0.4353, 1.0384], [0.4381, 1.0364], [0.455, 1.034], [0.4604, 1.0281], [0.4627, 1.0207], [0.4636, 1.0099], [0.4615, 0.9988], [0.4366, 0.9632], [0.4334, 0.9553], [0.435, 0.9418], [0.4443, 0.9356], [0.464, 0.9306], [0.494, 0.9306], [0.4961, 0.9338], [0.4952, 0.9453], [0.4981, 0.9586], [0.5144, 0.9875], [0.5226, 0.9976], [0.535, 1.012], [0.535, 1.064]];
    solid(g, GR, 0.04, P, X, 0.006);
    { const R = [], bk = [[0.4334, 0.9553], [0.4615, 0.9988]], fr = [[0.4952, 0.9453], [0.5144, 0.9875]]; for (let yy = 0.946; yy < 0.99; yy += 0.0085) { const z0 = zAt(bk, yy) + 0.008, z1 = zAt(fr, yy) - 0.008; R.push([0.0406, 0.0026, z1 - z0, X, yy, (z0 + z1) / 2]); } boxes(g, R, GM.rubber); }
    solid(g, [[0.53, 1.05], [0.619, 1.05], [0.619, 1.0362], [0.6132, 1.0332], [0.6086, 1.0069], [0.597, 0.9949], [0.5843, 0.99], [0.5681, 0.9899], [0.5328, 0.9994], [0.5226, 0.9976], [0.528, 1.02]], 0.03, K, X, 0.002,
      [shp(inset([[0.5578, 1.0203], [0.5597, 1.0134], [0.5626, 1.0079], [0.565, 1.0017], [0.581, 1.001], [0.5933, 1.0023], [0.6014, 1.008], [0.6042, 1.0191], [0.6026, 1.031], [0.5915, 1.0364], [0.5671, 1.0361], [0.5613, 1.0328], [0.5592, 1.0274]], -0.002))]);
    profile(g, shp([[0.5655, 1.048], [0.5655, 1.03], [0.5665, 1.02], [0.5705, 1.009], [0.574, 1.008], [0.5715, 1.019], [0.5712, 1.03], [0.5735, 1.048]]), 0.007, GM.metal2, X, 0.0008);
    // ---- the forearm: ribbed down its sides, rounded under; over the barrel the heat shield with its oval holes, the
    // carrying handle's hinge behind it
    solid(g, [[0.6591, 1.0451], [0.6696, 1.0385], [0.6739, 1.037], [0.7119, 1.0391], [1.0254, 1.0414], [1.0313, 1.0522], [1.0321, 1.0694], [1.0392, 1.0708], [1.0392, 1.12], [0.66, 1.12]], 0.072, P, X, 0.012);
    { const R = []; for (let z = 0.692; z < 1.022; z += 0.0084) R.push([0.0726, 0.052, 0.0026, X, 1.0805, z]); boxes(g, R, GM.rubber); }   // its rib grooves, flush with the sides
    const HS = [[0.77, 1.114], [1.03, 1.114], [1.03, 1.1586], [1.0237, 1.1624], [0.9543, 1.1596], [0.905, 1.1604], [0.899, 1.1586], [0.8621, 1.1591], [0.851, 1.1574], [0.8414, 1.1616], [0.826, 1.1644], [0.771, 1.1672]];
    { const holes = []; for (let k = 0; k < 9; k++) { const z = 0.853 + k * 0.0204; holes.push(shp(inset(rrect(z - 0.004, 1.128, z + 0.004, 1.152, 0.0039).getPoints().map(p => [p.x, p.y]), -0.002))); } solid(g, HS, 0.054, K, X, 0.002, holes); }
    box(g, 0.03, 0.044, 0.25, GM.rubber, X, 1.136, 0.9);                                                      // dark inside it, seen through the holes
    solid(g, [[0.676, 1.115], [0.771, 1.115], [0.771, 1.1672], [0.7655, 1.1702], [0.7322, 1.1702], [0.7238, 1.1691], [0.7232, 1.1629], [0.7283, 1.1593], [0.7234, 1.1542], [0.7182, 1.1536], [0.7092, 1.1565], [0.6814, 1.1566], [0.676, 1.158]], 0.05, K, X, 0.004);
    // ---- barrel, turned: its two collars, a band under the front sight, then thicker to the flash hider
    lathe(g, [[0.0001, 0.67], [0.0117, 0.67], [0.0117, 1.155], [0.0172, 1.1575], [0.0178, 1.165], [0.0172, 1.178], [0.0117, 1.1805], [0.0117, 1.2215], [0.0172, 1.224], [0.0178, 1.236], [0.0172, 1.246], [0.0117, 1.2485], [0.0117, 1.3405], [0.0178, 1.3425], [0.0178, 1.3915], [0.0165, 1.393], [0.0165, 1.43], [0.0001, 1.43]], GM.blued, X, y0, 28);
    // the A-frame front sight, a thin blade with its window, standing on the band
    profile(g, shp([[1.3423, 1.1415], [1.3924, 1.1415], [1.3924, 1.1446], [1.3903, 1.1466], [1.384, 1.2081], [1.3843, 1.2279], [1.3819, 1.2325], [1.3748, 1.236], [1.3738, 1.2316], [1.3697, 1.2311], [1.3681, 1.2289], [1.3471, 1.1643]],
      [shp(inset([[1.3524, 1.1521], [1.3763, 1.1468], [1.38, 1.148], [1.3804, 1.1532], [1.3773, 1.2042], [1.3735, 1.2066], [1.3681, 1.2045]], -0.001))]), 0.004, K, X, 0.0008);
    // the flash hider, turned, with four long slots round it (the dark bore seen through them)
    lathe(g, [[0.0001, 1.43], [0.0165, 1.43], [0.0165, 1.449], [0.0105, 1.449]], K, X, y0, 28);
    lathe(g, [[0.0105, 1.514], [0.0165, 1.514], [0.0165, 1.522], [0.0128, 1.535], [0.0098, 1.535], [0.0098, 1.514], [0.0105, 1.514]], K, X, y0, 28);
    cyl(g, 0.0102, 0.07, GM.rubber, X, y0, 1.483, 16);
    { const S = [0, Math.PI / 2, Math.PI, Math.PI * 1.5], half = 0.16; for (let i = 0; i < 4; i++) { const a0 = S[i] + half, a1 = S[(i + 1) % 4] + (i === 3 ? Math.PI * 2 : 0) - half, sh = new THREE.Shape(), N = 5, pt = (r, a) => [X + r * Math.sin(a), y0 - r * Math.cos(a)];
      for (let k = 0; k <= N; k++) { const pp = pt(0.0165, a0 + (a1 - a0) * k / N); k ? sh.lineTo(...pp) : sh.moveTo(...pp); } for (let k = N; k >= 0; k--) sh.lineTo(...pt(0.0105, a0 + (a1 - a0) * k / N)); sh.closePath(); xsec(g, sh, 1.448, 1.5145, K); } }
    // ---- the gas cylinder under the barrel and the block joining them under the sight; the bipod on its yoke at the
    // front, legs folded back along the cylinder (perforated, their feet hanging at the back), or down on them
    cyl(g, 0.0105, 0.36, K, X, 1.094, 1.215, 20); cyl(g, 0.0128, 0.022, GM.metal2, X, 1.094, 1.388, 20);
    solid(g, [[1.355, 1.09], [1.4, 1.09], [1.4, 1.135], [1.355, 1.135]], 0.02, K, X, 0.003);
    solid(g, [[1.395, 1.062], [1.43, 1.062], [1.43, 1.116], [1.395, 1.116]], 0.032, K, X, 0.004);   // the yoke
    if (!m.bipod) cyl(g, 0.0068, 0.032, GM.metal2, X, 1.069, 1.17, 14).rotation.x = 0;                     // the clamp holding the folded legs, up into the cylinder
    const legs = [];
    {
      const legH = []; for (let k = 0; k < 12; k++) { const z = -0.315 + k * 0.0205; legH.push(shp(inset(rrect(z - 0.004, -0.0095, z + 0.004, -0.0005, 0.0038).getPoints().map(p => [p.x, p.y]), -0.0008))); }
      [-1, 1].forEach(sd => {
        const lg = new THREE.Group(); lg.position.set(X + sd * 0.0172, 1.1, 1.41); g.add(lg);
        profile(lg, shp([[-0.375, -0.03], [0, -0.03], [0, 0.017], [-0.375, 0.017]], legH), 0.0024, K, 0, 0.0008);
        profile(lg, shp([[-0.3535, -0.072], [-0.3465, -0.072], [-0.344, -0.03], [-0.344, 0.004], [-0.355, 0.004], [-0.356, -0.03]]), 0.012, K, sd * 0.004, 0.001);   // its foot
        if (m.bipod) lg.rotation.set(-1.72, 0, sd * 0.2, 'ZYX');   // swung down, then splayed
        lg.userData.leg = { sd, down: !!m.bipod };   // (so a copy of the gun finds its legs too: player/stow.js)
        legs.push({ g: lg, r0: lg.rotation.clone(), down: !!m.bipod, sd });   // (each swings on its hinge as the gun moves: bipodSway, player/hold.js)
      });
    }
    // ---- the ammo box (in the mag group, so the reload can swap it): the hard olive 100-round box hanging on the left
    // under the feed tray, rounded at its corners, screwed at its edges, its lid propped open on the hinge along its
    // outer top edge, flipped back out of the way (taller with the belt and mag upgrades)
    const bh = 0.22 + 0.03 * T('mag'), bt = 1.1, bz0 = 0.448, bz1 = 0.622, bx0 = X + 0.032, bx1 = X + 0.132, bxm = (bx0 + bx1) / 2, bzm = (bz0 + bz1) / 2;
    {
      const sh = new THREE.Shape(), r = 0.011; sh.moveTo(bx0 + r, bz0); sh.lineTo(bx1 - r, bz0); sh.quadraticCurveTo(bx1, bz0, bx1, bz0 + r); sh.lineTo(bx1, bz1 - r); sh.quadraticCurveTo(bx1, bz1, bx1 - r, bz1); sh.lineTo(bx0 + r, bz1); sh.quadraticCurveTo(bx0, bz1, bx0, bz1 - r); sh.lineTo(bx0, bz0 + r); sh.quadraticCurveTo(bx0, bz0, bx0 + r, bz0);
      const geo = new THREE.ExtrudeGeometry(sh, { depth: bh - 0.006, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.0015, bevelSegments: 2, curveSegments: 6 });
      geo.rotateX(Math.PI / 2); geo.translate(0, bt - 0.003, 0);
      const bm = new THREE.Mesh(geo, GM.olive); bm.castShadow = true; mg.add(bm);
      box(mg, bx1 - bx0 - 0.008, 0.002, bz1 - bz0 - 0.01, GM.rubber, bxm, bt + 0.0006, bzm);                   // the open top, dark inside
      [[bz0 + 0.013, bt - 0.013], [bz1 - 0.013, bt - 0.013], [bz0 + 0.013, bt - bh + 0.013], [bz1 - 0.013, bt - bh + 0.013]].forEach(([z, yy]) => cyl(mg, 0.0028, 0.003, GM.oliveD, bx1 + 0.0008, yy, z, 10).rotation.set(0, 0, Math.PI / 2));   // screws
      cyl(mg, 0.0032, bz1 - bz0 - 0.008, GM.oliveD, bx1 - 0.002, bt + 0.003, bzm, 10);                          // the lid's hinge
      const lid = new THREE.Group(); lid.position.set(bx1 - 0.002, bt + 0.003, 0); lid.rotation.z = -1.95; mg.add(lid);   // flipped back past upright
      solid(lid, [[bz0 + 0.004, -0.0015], [bz1 - 0.004, -0.0015], [bz1 - 0.004, 0.0015], [bz0 + 0.004, 0.0015]], bx1 - bx0 - 0.004, GM.olive, -(bx1 - bx0 - 0.004) / 2, 0.0012);
    }
    // the belt: rounds pointing forward, each held in its link, looping up out of the box and over into the feed tray.
    // It shows what's left: under ten rounds they go from the box end first, and an empty gun shows none (player/hold.js)
    const belt = [];
    {
      const P0 = [X + 0.03, 1.146], P1 = [X + 0.15, 1.23], P2 = [bxm, 1.09], bez = t => [0, 1].map(c => (1 - t) * (1 - t) * P0[c] + 2 * (1 - t) * t * P1[c] + t * t * P2[c]);
      let prev = bez(0), run = 0; const pts = [prev];
      for (let i = 1; i <= 600 && pts.length < 10; i++) { const q = bez(i / 600); run += Math.hypot(q[0] - prev[0], q[1] - prev[1]); prev = q; if (run >= 0.0165) { pts.push(q); run = 0; } }
      pts.forEach(([x, yy]) => {
        const rd = new THREE.Group(); mg.add(rd);
        cyl(rd, 0.0072, 0.072, GM.brass, x, yy, 0.535, 14); taper(rd, 0.0062, 0.0018, 0.026, GM.copper, x, yy, 0.584);
        [-0.021, 0.021].forEach(o => ring(rd, 0.0099, 0.007, GM.metal2, x, yy, 0.535 + o));   // its link's loops, hooked into the next
        rd.userData.beltK = belt.length; belt.push(rd);
      });
    }
    // ---- optics sit on the feed cover
    return { front: 1.535, y: y0, slide: bolt, bolts: [], travel: 0.11, lock: true, mz: 0.535, top: 1.194, sz: 0.515, belt, legs };
  },
};
