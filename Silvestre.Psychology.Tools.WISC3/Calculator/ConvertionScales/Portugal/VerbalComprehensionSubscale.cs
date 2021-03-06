﻿using System.Collections.Generic;
using System.Linq;

namespace Silvestre.Psychology.Tools.WISC3.Calculator.ConvertionScales.Portugal
{
    internal class VerbalComprehensionSubscale : ConvertionScaleByLookup
    {
        private static readonly IDictionary<short, (short QI, decimal Percentile, (short, short) Per90, (short, short) Per95)> _lookupTable = new Dictionary<short, (short, decimal, (short, short), (short, short))>
        {
            { 4,  (48,  0m,     (46, 59),   (45, 61)) },
            { 5,  (49,  0m,     (47, 60),   (46, 62)) },
            { 6,  (50,  0m,     (48, 61),   (47, 63)) },
            { 7,  (51,  0.1m,   (49, 62),   (47, 63)) },
            { 8,  (52,  0.1m,   (50, 63),   (48, 64)) },
            { 9,  (53,  0.1m,   (50, 64),   (49, 65)) },
            { 10, (54,  0.1m,   (51, 65),   (50, 66)) },
            { 11, (56,  0.2m,   (53, 67),   (52, 68)) },
            { 12, (57,  0.2m,   (54, 68),   (53, 69)) },
            { 13, (58,  0.3m,   (55, 69),   (54, 70)) },
            { 14, (59,  0.3m,   (56, 69),   (55, 71)) },
            { 15, (60,  0.4m,   (57, 70),   (56, 72)) },
            { 16, (61,  0.5m,   (58, 71),   (57, 73)) },
            { 17, (63,  0.7m,   (60, 73),   (58, 74)) },
            { 18, (64,  0.8m,   (60, 74),   (59, 75)) },
            { 19, (65,  1m,     (61, 75),   (60, 76)) },
            { 20, (66,  1m,     (62, 76),   (61, 77)) },
            { 21, (68,  2m,     (64, 78),   (63, 79)) },
            { 22, (70,  2m,     (66, 80),   (65, 81)) },
            { 23, (71,  3m,     (67, 80),   (66, 82)) },
            { 24, (72,  3m,     (68, 81),   (67, 83)) },
            { 25, (74,  4m,     (70, 83),   (68, 84)) },
            { 26, (76,  6m,     (71, 85),   (70, 86)) },
            { 27, (78,  7m,     (73, 87),   (72, 88)) },
            { 28, (80,  9m,     (75, 89),   (74, 90)) },
            { 29, (82,  12m,    (77, 90),   (76, 92)) },
            { 30, (83,  13m,    (78, 91),   (77, 93)) },
            { 31, (85,  16m,    (80, 93),   (78, 94)) },
            { 32, (87,  19m,    (81, 95),   (80, 96)) },
            { 33, (88,  21m,    (82, 96),   (81, 97)) },
            { 34, (90,  25m,    (84, 98),   (83, 99)) },
            { 35, (92,  30m,    (86, 100),  (85, 101)) },
            { 36, (94,  34m,    (88, 101),  (87, 103)) },
            { 37, (95,  37m,    (89, 102),  (87, 103)) },
            { 38, (97,  42m,    (90, 104),  (89, 105)) },
            { 39, (99,  47m,    (92, 106),  (91, 107)) },
            { 40, (100, 50m,    (93, 107),  (92, 108)) },
            { 41, (102, 55m,    (95, 109),  (94, 110)) },
            { 42, (103, 58m,    (96, 110),  (95, 111)) },
            { 43, (105, 63m,    (98, 111),  (97, 113)) },
            { 44, (106, 65m,    (99, 112),  (97, 113)) },
            { 45, (108, 70m,    (100, 114), (99, 115)) },
            { 46, (109, 72m,    (101, 115), (100, 116)) },
            { 47, (110, 75m,    (102, 116), (101, 117)) },
            { 48, (111, 77m,    (103, 117), (102, 118)) },
            { 49, (113, 81m,    (105, 119), (104, 120)) },
            { 50, (114, 82m,    (106, 120), (105, 121)) },
            { 51, (116, 86m,    (108, 121), (107, 123)) },
            { 52, (118, 88m,    (110, 123), (108, 124)) },
            { 53, (119, 90m,    (110, 124), (109, 125)) },
            { 54, (121, 92m,    (112, 126), (111, 127)) },
            { 55, (122, 93m,    (113, 127), (112, 128)) },
            { 56, (124, 94m,    (115, 129), (114, 130)) },
            { 57, (125, 95m,    (116, 130), (115, 131)) },
            { 58, (126, 96m,    (117, 130), (116, 132)) },
            { 59, (128, 97m,    (119, 132), (117, 133)) },
            { 60, (129, 97m,    (120, 133), (118, 134)) },
            { 61, (131, 98m,    (121, 135), (120, 136)) },
            { 62, (132, 98m,    (122, 136), (121, 137)) },
            { 63, (134, 99m,    (124, 138), (123, 139)) },
            { 64, (136, 99.2m,  (126, 140), (125, 141)) },
            { 65, (138, 99.4m,  (128, 141), (127, 143)) },
            { 66, (140, 99.6m,  (130, 143), (128, 144)) },
            { 67, (141, 99.7m,  (131, 144), (129, 145)) },
            { 68, (142, 99.7m,  (131, 145), (130, 146)) },
            { 69, (143, 99.8m,  (132, 146), (131, 147)) },
            { 70, (144, 99.8m,  (133, 147), (132, 148)) },
            { 71, (145, 99.9m,  (134, 148), (133, 149)) },
            { 72, (146, 99.9m,  (135, 149), (134, 150)) },
            { 73, (147, 99.9m,  (136, 150), (135, 151)) },
            { 74, (148, 99.9m,  (137, 150), (136, 152)) },
            { 75, (149, 99.9m,  (138, 151), (137, 153)) },
            { 76, (150, 100m,   (139, 152), (138, 154)) }
        };

        protected internal override IDictionary<short, (short QI, decimal Percentile, (short, short) Per90, (short, short) Per95)> LookupTable => _lookupTable;

        protected override (short QI, decimal Percentile, (short, short) Per90, (short, short) Per95)? OnResultOutOfBounds(short results)
        {
            var maxValue = this.LookupTable.Keys.Max();
            return this.LookupTable[maxValue];
        }
    }
}