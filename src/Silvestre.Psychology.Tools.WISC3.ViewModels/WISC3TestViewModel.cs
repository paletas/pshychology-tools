using System;

namespace Silvestre.Psychology.Tools.WISC3.ViewModels
{
    public class WISC3TestViewModel
    {
        private readonly ITestStandardizer _testStandardizer;
        private readonly TestTypeEnum _testType;
        private readonly TestDescriptor _testDescriptor;
        private TestDescriptorPerAge? _testDescriptorPerAge;
        private Age? _subjectAge;
        private short? _rawResult;

        public WISC3TestViewModel(string testName, string category, ITestStandardizer testStandardizer, TestTypeEnum testType)
        {
            _testStandardizer = testStandardizer;
            _testType = testType;
            _testDescriptor = _testStandardizer.GetTestDescriptor(_testType);

            TestCategory = category;
            TestName = testName;
        }

        public event EventHandler? OnStandardResultsUpdated;

        public string TestCategory { get; }

        public string TestName { get; }

        public bool Mandatory => _testDescriptor.Mandatory;

        public Age? SubjectAge
        {
            get => _subjectAge;
            set
            {
                if (_subjectAge == null && value == null || _subjectAge == null && _subjectAge.Equals(value)) return;

                _subjectAge = value;

                if (_subjectAge == null)
                {
                    _testDescriptorPerAge = null;
                    MinRawResult = MaxRawResult = null;
                }
                else
                {

                    _testDescriptorPerAge = _testStandardizer.GetTestDescriptorPerAge(_testType, _subjectAge.Value);
                    MinRawResult = _testDescriptorPerAge.Boundaries.Min;
                    MaxRawResult = _testDescriptorPerAge.Boundaries.Max;

                    if (RawResult < MinRawResult || RawResult > MaxRawResult)
                        RawResult = null;
                }

                UpdateStandardResults();
            }
        }

        public short? MinRawResult
        {
            get; private set;
        }

        public short? MaxRawResult
        {
            get; private set;
        }

        public short? RawResult
        {
            get => _rawResult;
            set
            {
                _rawResult = value;
                UpdateStandardResults();
            }
        }

        public bool TestOK
        {
            get => RawResult != null && RawResultOutOfBounds == false;
        }

        public short? StandardVerbal { get; private set; }

        public short? StandardRealization { get; private set; }

        public short? StandardVerbalComprehension { get; private set; }

        public short? StandardPerceptiveOrganization { get; private set; }

        public short? StandardProcessingVelocity { get; private set; }

        public bool RawResultOutOfBounds { get; private set; }

        internal void UpdateStandardResults()
        {
            if (SubjectAge != null && RawResult != null && RawResult >= MinRawResult && RawResult <= MaxRawResult)
            {
                var results = _testStandardizer.Standerdization(_testType, SubjectAge.Value, RawResult.Value);

                StandardVerbal = results.Verbal;
                StandardRealization = results.Realization;
                StandardVerbalComprehension = results.VerbalComprehension;
                StandardPerceptiveOrganization = results.PerceptiveOrganization;
                StandardProcessingVelocity = results.ProcessingVelocity;

                RawResultOutOfBounds = false;
            }
            else
            {
                StandardVerbal = null;
                StandardRealization = null;
                StandardVerbalComprehension = null;
                StandardPerceptiveOrganization = null;
                StandardProcessingVelocity = null;

                RawResultOutOfBounds = RawResult < MinRawResult || RawResult > MaxRawResult;
            }

            OnStandardResultsUpdated?.Invoke(this, EventArgs.Empty);
        }
    }
}
