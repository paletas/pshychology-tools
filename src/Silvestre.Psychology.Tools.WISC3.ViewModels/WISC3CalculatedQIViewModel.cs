using Silvestre.Psychology.Tools.WISC3.Calculator;

namespace Silvestre.Psychology.Tools.WISC3.ViewModels
{
    public enum AverageComparisonResultEnum
    {
        ExtremelyBelow,
        FarBelow,
        Below,
        OnAverage,
        Above,
        FarAbove,
        ExtremelyAbove
    }

    public class WISC3CalculatedQIViewModel
    {

        private static IDictionary<Range, AverageComparisonResultEnum> _ComparisonTable = new Dictionary<Range, AverageComparisonResultEnum>
        {
            { 0..69, AverageComparisonResultEnum.ExtremelyBelow },
            { 70..79, AverageComparisonResultEnum.FarBelow },
            { 80..89, AverageComparisonResultEnum.Below },
            { 90..109, AverageComparisonResultEnum.OnAverage },
            { 110..119, AverageComparisonResultEnum.Above },
            { 120..129, AverageComparisonResultEnum.FarAbove },
            { 130..int.MaxValue, AverageComparisonResultEnum.ExtremelyAbove }
        };

        private readonly Func<short, CalculatedIndexResult?> _calculateQI;
        private short? _standardResult;

        public WISC3CalculatedQIViewModel(string qiName, Func<short, CalculatedIndexResult?> calculateQI)
        {
            _calculateQI = calculateQI;

            Name = qiName;
        }

        public string Name { get; }

        public short? StandardResult
        {
            get => _standardResult;
            set
            {
                _standardResult = value;
                CalculateQI();
            }
        }

        public short? IndexQI { get; private set; }

        public decimal? Percentil { get; private set; }

        public (short LowerBound, short UpperBound)? ConfidenceInterval90 { get; private set; }

        public (short LowerBound, short UpperBound)? ConfidenceInterval95 { get; private set; }

        public AverageComparisonResultEnum? AverageComparisonResult
        {
            get
            {
                if (IndexQI.HasValue)
                {
                    return _ComparisonTable.Single(kv => kv.Key.Start.Value <= IndexQI.Value && kv.Key.End.Value >= IndexQI.Value).Value;
                }
                else return null;
            }
        }

        private void CalculateQI()
        {
            if (StandardResult == null) return;

            var qi = _calculateQI(StandardResult.Value);

            IndexQI = qi?.Value;
            Percentil = qi?.Percentil;
            ConfidenceInterval90 = qi?.ConfidenceInterval90;
            ConfidenceInterval95 = qi?.ConfidenceInterval95;
        }
    }
}
